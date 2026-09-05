/**
 * Restore a PAUSED run's parked ask — the one sequence behind the card's Resume button
 * (`t3team-workflowRunControl.ts`) and the agent's `t3team.orchestration.resume`
 * (`t3team-toolBrokerWorkflowResumeActions.ts`), so the two cannot drift (GHE #404).
 *
 * Pause removes the pending ask but leaves the child turn running; by the time Resume is clicked
 * that turn has usually finished, and nothing will ever settle a merely re-registered ask. So a
 * `thread.turn` ask is re-registered with its journaled re-drive budget and `redriveArmed`, then
 * handed to the re-drive, which consumes an already-produced answer or re-issues the prompt.
 */
import * as Effect from "effect/Effect";

import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";

export interface ResumePausedTurnDeps {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly turnRedrive?: InterruptedTurnRetry | undefined;
}

/** Validation shared by both entry points; `null` means the run can be resumed. */
export function pausedResumeBlocker(deps: ResumePausedTurnDeps, run: WorkflowRun): string | null {
  if (run.pendingCorrelationId === null && run.wakeAt === null) {
    return "Paused workflow has no continuation to resume.";
  }
  if (run.pendingCorrelationId !== null && deps.registry.getRun(run.runId) === undefined) {
    return "Workflow controller is not ready. Restart the server and try again.";
  }
  if (run.pendingKind === "thread.turn" && deps.turnRedrive === undefined) {
    return "Workflow turn re-drive is not available.";
  }
  return null;
}

/**
 * Re-register the row's pending ask and, for a `thread.turn`, re-drive it at once. Callers have
 * already flipped the row out of `paused` and released the admission queue.
 */
export const restorePausedPendingAsk = Effect.fn("restorePausedPendingAsk")(function* (
  deps: ResumePausedTurnDeps,
  run: WorkflowRun,
) {
  if (run.pendingKind === null || run.pendingThreadId === null || run.pendingCorrelationId === null)
    return;
  deps.registry.setPending(run.pendingThreadId, {
    runId: run.runId,
    correlationId: run.pendingCorrelationId,
    kind: run.pendingKind,
    ...(run.pendingKind === "thread.turn"
      ? { turnRetries: run.turnRetries ?? 0, redriveArmed: true as const }
      : {}),
  });
  if (run.pendingKind === "thread.turn" && deps.turnRedrive !== undefined) {
    yield* deps.turnRedrive.processTurnRetry({
      threadId: run.pendingThreadId,
      correlationId: run.pendingCorrelationId,
    });
  }
});
