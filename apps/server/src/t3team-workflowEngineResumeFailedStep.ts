/**
 * Resume a run that FAILED at an unanswered `thread.turn` step — the host's verdict after the
 * step's provider turn died or fell silent and its bounded re-drive budget ran out (GHE #403).
 *
 * Why the plain journal resume ({@link resumeWorkflowRunFromJournal}) cannot do this: the step's
 * `sent` entry is journaled, so a same-prefix replay does NOT re-fire the ask — it reaches the
 * `sent` line, finds no `resolved` reply, and parks the run again on a correlation nobody will
 * ever settle (no pending ask in the registry, no provider turn in flight). The row would sit
 * `running`/`suspended` forever: a second zombie behind the first.
 *
 * So a host-detected step failure keeps the row's pending ask
 * (`WorkflowRunLifecycle.recordFailed({ retainPending })`), and this path re-drives THAT step
 * instead of replaying: rebuild the controller (so the reactor can `resume` the run when the
 * re-driven turn answers), park the row on the same ask again with a fresh re-drive budget,
 * re-register the pending ask, and re-issue the step's prompt through the same
 * `thread.turn.resume` command the Continue button and the interrupted-turn re-drive use.
 */
import * as Effect from "effect/Effect";

import type { WorkflowRunRepositoryShape } from "./persistence/Services/WorkflowRuns.ts";
import { createWorkflowRunController } from "./t3team-workflowEngineController.ts";
import type { LaunchWorkflowRecipeInput } from "./t3team-workflowEngineLaunchTypes.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";

export interface FailedTurnStep {
  readonly threadId: string;
  readonly correlationId: string;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Re-drive the retained `thread.turn` step of a failed run. Resolves once the re-drive has been
 * issued (or deliberately skipped because a turn is already in flight on the thread — that
 * turn's own settle then decides the step). A step whose prompt can no longer be found fails the
 * run again through the normal funnel, with the reason recorded.
 */
export const resumeFailedTurnStep = Effect.fn("resumeFailedTurnStep")(function* (input: {
  readonly launch: LaunchWorkflowRecipeInput;
  readonly step: FailedTurnStep;
  readonly runRepository: WorkflowRunRepositoryShape;
  readonly turnRedrive: InterruptedTurnRetry;
}) {
  const { launch, step } = input;
  // The claim: a failed run has NO controller (the failure funnel deleted it), so a registered
  // one means another resume already took this run. Checked and registered in the same
  // synchronous tick, so two concurrent resumes cannot both pass (single-instance host).
  if (launch.registry.getRun(launch.runId) !== undefined) {
    return yield* Effect.fail(
      `Workflow run '${launch.runId}' is already being resumed; observe it via t3team.orchestration.status.`,
    );
  }
  // The controller is what the reactor calls `resume` on when the re-driven turn answers.
  // Registered BEFORE the durable write below, so a write failure must unregister it again — a
  // controller left claimed with nothing durably parked would reject every later resume as
  // "already being resumed" forever (GHE #411 §4).
  createWorkflowRunController(launch);
  // A resumed step earns a fresh re-drive budget: the operator (or agent) chose to retry after
  // seeing the reason, so the exhausted counter must not fail it again on the first no-text.
  yield* input.runRepository
    .setTurnRetries({ runId: launch.runId, turnRetries: 0, updatedAt: launch.nowIso() })
    .pipe(Effect.catchCause(() => Effect.void));
  // Park the row on the same ask again (status back to `suspended`, pending columns unchanged).
  // A failed write must delete the just-registered controller before propagating, or the run is
  // stuck neither durably parked nor resumable.
  yield* Effect.tryPromise({
    try: () =>
      launch.lifecycle?.recordSuspended({
        threadId: step.threadId,
        correlationId: step.correlationId,
        kind: "thread.turn",
      }) ?? Promise.resolve(),
    catch: (error) => errorMessage(error),
  }).pipe(Effect.tapCause(() => Effect.sync(() => launch.registry.deleteRun(launch.runId))));
  // `turnRetries: 0` (not undefined) marks the ask as re-drivable on a later no-text settle too —
  // the same shape boot rehydration hands a restored `thread.turn` ask.
  launch.registry.setPending(step.threadId, {
    runId: launch.runId,
    correlationId: step.correlationId,
    kind: "thread.turn",
    turnRetries: 0,
    // The dead session's tail writes must not count against the fresh budget before the
    // re-driven turn starts (see `WorkflowPendingAsk.redriveArmed`).
    redriveArmed: true,
  });
  yield* input.turnRedrive.processTurnRetry({
    threadId: step.threadId,
    correlationId: step.correlationId,
  });
});
