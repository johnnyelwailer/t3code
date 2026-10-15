/**
 * Session-level transient-run retry on V2 (GHE #306): when a run FAILS with
 * a transient failure (gateway 423/429/5xx, a watchdog stall, a provider
 * `retryable` failure — see `orchestration-v2/t3team-transientRunFailure.ts`),
 * note it in the thread and, after a bounded backoff, continue the run with
 * upstream `message.dispatch{manualContinuationOfRunId}` (accepted for such
 * runs by the fork's eligibility hook in `Orchestrator.ts`). Up to
 * `MAX_SESSION_TRANSIENT_RETRIES` retries per episode (`MAX_OUTAGE_TRANSIENT_RETRIES`
 * with a longer ladder for a network outage), counted from durable runs
 * (`t3team-threadTransientTurnRetryPlan.ts`).
 *
 * Only runs whose retry the session owns are continued — never a user stop, a
 * delegated child (its parent was already told) or a workflow step (the
 * workflow re-drives it): `t3team-threadTransientTurnRetryOwner.ts`. A user
 * message during the backoff makes the continuation ineligible (no longer the
 * latest run), so it is dropped. The backoff timer is in-memory (up to 10 min
 * for a network outage): a restart during the wait leaves the failed run to the user's Resume.
 * With flag `TRANSIENT_AUTO_RESUME` on, the wait is durable instead
 * (`t3team-transientAutoResume.ts`). Live layer: `t3team-threadTransientTurnRetryLive.ts`.
 *
 * @module t3team-threadTransientTurnRetryReactor
 */
import {
  CommandId,
  type OrchestrationV2AppThread,
  type OrchestrationV2ConversationMessage,
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

import { classifyTransientRunFailure } from "./orchestration-v2/t3team-transientRunFailure.ts";
import { armTransientAutoResume } from "./t3team-transientAutoResume.ts";
import {
  transientRetryLeftToParentText,
  transientRetryReason,
} from "./t3team-threadTransientTurnRetryPolicy.ts";
import {
  planTransientRetry,
  transientRetryMessageId,
  transientRetryNoteId,
} from "./t3team-threadTransientTurnRetryPlan.ts";
import { transientRetryOwner } from "./t3team-threadTransientTurnRetryOwner.ts";

export interface TransientRetryDeps {
  /**
   * The thread, all its runs, the failed run's `TRANSIENT_RETRY_TURN_ITEM_TYPES` items and its
   * user message(s).
   */
  readonly loadRecords: (
    threadId: ThreadId,
    runId: RunId,
  ) => Effect.Effect<{
    readonly thread: Pick<OrchestrationV2AppThread, "lineage" | "forkedFrom"> | null;
    readonly runs: ReadonlyArray<OrchestrationV2Run>;
    readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
    readonly messages: ReadonlyArray<OrchestrationV2ConversationMessage>;
  }>;
  readonly dispatch: (command: OrchestrationV2ServerCommand) => Effect.Effect<unknown, string>;
  readonly recordNote: (input: {
    readonly threadId: ThreadId;
    readonly messageId: ReturnType<typeof transientRetryNoteId>;
    readonly text: string;
  }) => Effect.Effect<unknown, string>;
  readonly delayMs: (attempt: number, directiveSeconds: number | null, outage: boolean) => number;
  /** Flag `TRANSIENT_AUTO_RESUME`: arm the durable continuation instead of sleeping here. */
  readonly autoResume?: () => boolean;
}

/** Handles one failed run: note, back off, continue. Fail-open (logs). */
export const handleTransientRunFailure = (
  deps: TransientRetryDeps,
  input: { readonly threadId: ThreadId; readonly runId: RunId },
) =>
  Effect.gen(function* () {
    const records = yield* deps.loadRecords(input.threadId, input.runId);
    const run = records.runs.find((entry) => entry.id === input.runId);
    if (run === undefined || run.status !== "failed") return;
    const owner = transientRetryOwner({ ...records, run });
    if (owner === "user-stop") return;
    const failure = classifyTransientRunFailure(latestRootProviderFailure(run, records.turnItems));
    if (failure === null) return;
    if (owner === "workflow") {
      return yield* Effect.logInfo("transient-retry: workflow step left to its re-drive", input);
    }
    if (owner === "parent") {
      yield* deps.recordNote({
        threadId: input.threadId,
        messageId: transientRetryNoteId(run.id),
        text: transientRetryLeftToParentText(transientRetryReason(failure)),
      });
      return;
    }
    const plan = planTransientRetry({
      runs: records.runs,
      failedRunId: run.id,
      failure,
      delayMs: deps.delayMs,
    });
    if (deps.autoResume?.() === true) {
      return yield* armTransientAutoResume(deps, { ...input, runs: records.runs, failure, plan });
    }
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
