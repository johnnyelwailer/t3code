/**
 * Cold-cache local compaction. When a pack registered a route for the thread's driver and the
 * thread's prompt cache has expired, the route's local model writes the compaction summary instead
 * of the driver's native `/compact`.
 *
 * The summary leaves as a ready `full_thread_summary` handoff, the same record a resume fallback
 * writes, so the next turn's existing handoff delivery seeds a fresh native session with it.
 * Any failure resolves to `undefined`: the caller then runs the native `/compact` unchanged.
 *
 * @module t3team-coldLocalCompaction
 */
import {
  ProviderInstanceId,
  type OrchestrationV2ContextHandoff,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2Run,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { latestNativeContextUsage } from "@t3tools/provider-core/server/handoffBudget";
import type { ColdLocalCompactionRouteDefinition } from "@t3team/pack-api";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { ContextHandoffServiceV2Shape } from "./ContextHandoffService.ts";
import type { ProjectionStoreV2Error } from "./ProjectionStore.ts";
import { hasOtherActiveRun, isColdCompactionRouted } from "./t3team-coldCompactionGate.ts";

export class ColdLocalCompactionError extends Data.TaggedError("ColdLocalCompactionError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export interface ColdLocalCompactionShape {
  /** The enabled route of `driver` whose local provider can serve it; `undefined` stays native. */
  readonly routeFor: (
    driver: string,
  ) => Effect.Effect<ColdLocalCompactionRouteDefinition | undefined>;
  readonly summarize: (input: {
    readonly route: ColdLocalCompactionRouteDefinition;
    readonly transcript: string;
  }) => Effect.Effect<string, ColdLocalCompactionError>;
}

export class ColdLocalCompaction extends Context.Reference<ColdLocalCompactionShape>(
  "t3team/v2/ColdLocalCompaction",
  {
    defaultValue: () => ({
      routeFor: () => Effect.undefined,
      summarize: () =>
        Effect.fail(new ColdLocalCompactionError({ reason: "No route is registered." })),
    }),
  },
) {}

export interface ColdLocalCompactionRequest {
  readonly compaction: ColdLocalCompactionShape;
  readonly contextHandoffService: ContextHandoffServiceV2Shape;
  readonly projection: Pick<OrchestrationV2ThreadProjection, "providerTurns" | "attempts" | "runs">;
  readonly run: OrchestrationV2Run;
  /** The provider thread holding the thread's native session. */
  readonly nativeThread: OrchestrationV2ProviderThread | undefined;
  readonly loadItems: Effect.Effect<ReadonlyArray<OrchestrationV2TurnItem>, ProjectionStoreV2Error>;
  readonly now: DateTime.Utc;
}

const isEarlierRunItem =
  (runs: ReadonlyArray<OrchestrationV2Run>, run: OrchestrationV2Run) =>
  (item: OrchestrationV2TurnItem): boolean =>
    item.runId === null ||
    runs.some((source) => source.id === item.runId && source.ordinal < run.ordinal);

/** Without `history` the delivery sends `summaryText` itself: the summary, not the raw turns. */
const withoutHistory = (handoff: OrchestrationV2ContextHandoff): OrchestrationV2ContextHandoff => {
  const { history: _rawHistory, ...rest } = handoff;
  return rest;
};

const summarizeLocally = (request: ColdLocalCompactionRequest) =>
  Effect.gen(function* () {
    const { run, nativeThread, projection } = request;
    if (nativeThread === undefined) return undefined;
    const route = yield* request.compaction.routeFor(nativeThread.driver);
    const usage = latestNativeContextUsage(projection, nativeThread);
    const routed = isColdCompactionRouted({
      route,
      driver: nativeThread.driver,
      usage: usage && { usedTokens: usage.usage.usedTokens, reportedAt: usage.reportedAt },
      nowMs: DateTime.toEpochMillis(request.now),
      otherRunActive: hasOtherActiveRun(projection.runs, run.id),
    });
    if (!routed || route === undefined) return undefined;
    const items = (yield* request.loadItems).filter(isEarlierRunItem(projection.runs, run));
    const base = yield* request.contextHandoffService.prepareProviderHandoff({
      threadId: run.threadId,
      targetRunId: run.id,
      transferId: null,
      fromProviderThreadIds: [nativeThread.id],
      toProviderThreadId: nativeThread.id,
      fromProviderInstanceId: nativeThread.providerInstanceId,
      toProviderInstanceId: nativeThread.providerInstanceId,
      coveredRunOrdinals: { from: 1, to: Math.max(1, run.ordinal - 1) },
      strategy: "full_thread_summary",
      runs: projection.runs,
      items,
      createdAt: request.now,
    });
    const summary = (yield* request.compaction.summarize({
      route,
      transcript: base.summaryText,
    })).trim();
    if (summary.length === 0) {
      return yield* new ColdLocalCompactionError({ reason: "The local summary is empty." });
    }
    return {
      ...withoutHistory(base),
      summaryText: summary,
      createdByProviderInstanceId: ProviderInstanceId.make(route.localProviderInstance),
    } satisfies OrchestrationV2ContextHandoff;
  });

export const tryColdLocalCompaction = (
  request: ColdLocalCompactionRequest,
): Effect.Effect<OrchestrationV2ContextHandoff | undefined> =>
  summarizeLocally(request).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.interrupt
        : Effect.logWarning("t3team.cold-local-compaction-failed", {
            runId: request.run.id,
            cause,
          }).pipe(Effect.as(undefined)),
    ),
  );
