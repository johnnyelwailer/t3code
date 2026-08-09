/**
 * The crash-recovery half of the durable run lifecycle, split out of
 * `t3team-workflowEngineDurability.ts` for the additive LOC ceiling.
 *
 * The scheduler resumed a clock park whose `waitUntil` reply had already been journaled by a
 * PRIOR process that died before settling (`appendResolvedEntry → wrote:false`). The run row is
 * stuck `sleeping`, so `listSleeping` re-arms it forever. Mark it failed — but ONLY when the row
 * is still parked on THIS correlation, so a late/duplicate ask reply on an already-woken run (now
 * sleeping on a different `waitUntil`) is never spuriously failed. The conversation is told too:
 * failing silently with only a server log line is how "the agent thinks the run is still going"
 * happened before.
 */

import type { OrchestrationCommand } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import { deliverWorkflowFailure } from "./t3team-workflowCompletionMessage.ts";
import { workflowFailureStepText } from "./t3team-workflowFailureReason.ts";

/** The agent-facing reason a crash-orphaned clock park failed — persisted AND posted. */
const ORPHANED_WAKE_REASON =
  "A crash interrupted this run's scheduled wake-up; it could not be resumed.";

export function makeOrphanIfSleeping(opts: {
  readonly repo: WorkflowRunRepositoryShape;
  readonly row: WorkflowRun;
  readonly nowIso: () => string;
  readonly releaseAdmission: () => void;
  readonly dispatch?: (command: OrchestrationCommand) => Promise<void>;
  readonly newId?: () => string;
}): (correlationId: string) => Promise<void> {
  const { repo, row } = opts;
  return (correlationId) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const current = yield* repo.getById({ runId: row.runId });
        if (
          Option.isNone(current) ||
          (current.value.status !== "sleeping" && current.value.status !== "running") ||
          current.value.pendingCorrelationId !== correlationId
        )
          return;
        yield* repo.clearPending({
          runId: row.runId,
          status: "failed",
          updatedAt: opts.nowIso(),
          failureReason: ORPHANED_WAKE_REASON,
          failureStep: workflowFailureStepText("scheduler-wake", "wait.until"),
        });
        opts.releaseAdmission();
        yield* Effect.logWarning(
          "workflow scheduler orphaned a sleeping run whose wake reply was resolved before settle",
          { runId: row.runId, correlationId },
        );
        if (opts.dispatch !== undefined && opts.newId !== undefined) {
          yield* Effect.promise(() =>
            deliverWorkflowFailure({
              launchThreadId: row.launchThreadId ?? undefined,
              workflowRunId: row.runId,
              errorText: ORPHANED_WAKE_REASON,
              dispatch: opts.dispatch!,
              newId: opts.newId!,
              nowIso: opts.nowIso,
            }),
          );
        }
      }),
    );
}
