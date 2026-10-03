/**
 * Session-level transient-run retry on V2 (GHE #306): when a run FAILS with
 * a transient failure (gateway 423/429/5xx, a watchdog stall, a provider
 * `retryable` failure — see `orchestration-v2/t3team-transientRunFailure.ts`),
 * note it in the thread and, after a bounded backoff, continue the run with
 * upstream `message.dispatch{manualContinuationOfRunId}` (accepted for such
 * runs by the fork's eligibility hook in `Orchestrator.ts`). Up to
 * `MAX_SESSION_TRANSIENT_RETRIES` retries per episode, counted from durable
 * runs (`t3team-threadTransientTurnRetryPlan.ts`).
 *
 * A user stop is never resurrected (the run ends `interrupted`, not
 * `failed`); a user message during the backoff makes the continuation
 * ineligible (no longer the latest run), so it is dropped. The backoff timer
 * is in-memory: a restart during the wait leaves the failed run to the user's
 * Resume.
 *
 * @module t3team-threadTransientTurnRetryReactor
 */
import {
  CommandId,
  type OrchestrationV2ServerCommand,
  type OrchestrationV2Run,
  type OrchestrationV2TurnItem,
  type RunId,
  type ThreadId,
} from "@t3tools/contracts";
import { latestRootProviderFailure } from "@t3tools/shared/orchestrationV2ThreadError";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { classifyTransientRunFailure } from "./orchestration-v2/t3team-transientRunFailure.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { forkParked } from "./serverActivation.ts";
import { transientTurnRetryDelayMs } from "./t3team-threadTransientTurnRetryPolicy.ts";
import {
  planTransientRetry,
  transientRetryMessageId,
  transientRetryNoteId,
} from "./t3team-threadTransientTurnRetryPlan.ts";
import { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";

export interface TransientRetryDeps {
  /** All runs of the thread plus the failed run's `error` turn items. */
  readonly loadRecords: (
    threadId: ThreadId,
    runId: RunId,
  ) => Effect.Effect<{
    readonly runs: ReadonlyArray<OrchestrationV2Run>;
    readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
  }>;
  readonly dispatch: (command: OrchestrationV2ServerCommand) => Effect.Effect<unknown, string>;
  readonly recordNote: (input: {
    readonly threadId: ThreadId;
    readonly messageId: ReturnType<typeof transientRetryNoteId>;
    readonly text: string;
  }) => Effect.Effect<unknown, string>;
  readonly delayMs: (attempt: number, directiveSeconds: number | null) => number;
}

/** Handles one failed run: note, back off, continue. Fail-open (logs). */
export const handleTransientRunFailure = (
  deps: TransientRetryDeps,
  input: { readonly threadId: ThreadId; readonly runId: RunId },
) =>
  Effect.gen(function* () {
    const { runs, turnItems } = yield* deps.loadRecords(input.threadId, input.runId);
    const run = runs.find((entry) => entry.id === input.runId);
    if (run === undefined || run.status !== "failed") return;
    const failure = classifyTransientRunFailure(latestRootProviderFailure(run, turnItems));
    if (failure === null) return;
    const plan = planTransientRetry({
      runs,
      failedRunId: run.id,
      failure,
      delayMs: deps.delayMs,
    });
    yield* deps.recordNote({
      threadId: input.threadId,
      messageId: transientRetryNoteId(run.id),
      text: plan.note,
    });
    if (plan.kind === "exhausted") return;
    yield* Effect.sleep(Duration.millis(plan.delayMs));
    yield* deps
      .dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(`server:t3team:transient-retry:${run.id}`),
        threadId: input.threadId,
        messageId: transientRetryMessageId(run.id),
        text: "Continue where you left off.",
        attachments: [],
        manualContinuationOfRunId: run.id,
        dispatchMode: { type: "start_immediately" },
        createdBy: "system",
        creationSource: "server",
      })
      .pipe(
        // Ineligible by now (user message, archive, pending question): drop the retry.
        Effect.catch((cause) =>
          Effect.logInfo("transient-retry: continuation not dispatched", {
            threadId: input.threadId,
            runId: run.id,
            cause,
          }),
        ),
      );
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : Effect.logWarning("transient-retry: failed-run handling failed", {
            ...input,
            cause: Cause.pretty(cause),
          }),
    ),
  );

const parseBackoffOverride = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const T3TeamThreadTransientTurnRetryLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const recorder = yield* T3TeamThreadMessageRecorder;
    const scope = yield* Effect.scope;
    const backoffOverride = parseBackoffOverride(
      process.env.T3TEAM_TRANSIENT_TURN_RETRY_BACKOFF_MS,
    );
    const deps: TransientRetryDeps = {
      loadRecords: (threadId, runId) =>
        threads
          .getThreadRecords(threadId, ["runs", "turnItems"], {
            turnItemRunId: runId,
            turnItemTypes: ["error"],
          })
          .pipe(Effect.orElseSucceed(() => ({ runs: [], turnItems: [] }))),
      dispatch: (command) => threads.dispatch(command).pipe(Effect.mapError(String)),
      recordNote: ({ threadId, messageId, text }) =>
        recorder
          .record({ threadId, messageId, role: "system", text })
          .pipe(Effect.mapError(String)),
      delayMs: (attempt, directive) =>
        transientTurnRetryDelayMs(attempt, directive, backoffOverride),
    };
    // A run can be re-published as failed; handle each failed run once per process.
    const handled = new Set<string>();
    yield* forkParked(
      Stream.runForEach(threads.streamDomainEvents, (event) => {
        if (event.type !== "run.updated" || event.payload.status !== "failed") return Effect.void;
        if (handled.has(event.payload.id)) return Effect.void;
        handled.add(event.payload.id);
        return handleTransientRunFailure(deps, {
          threadId: event.threadId,
          runId: event.payload.id,
        }).pipe(Effect.forkIn(scope), Effect.asVoid);
      }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("transient-retry: domain event stream failed", { cause }),
        ),
      ),
    );
  }),
);
