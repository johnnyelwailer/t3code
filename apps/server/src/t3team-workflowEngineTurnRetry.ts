/**
 * Bounded re-drive of a `thread.turn` step whose agent turn never answered — because the host
 * INTERRUPTED it mid-turn (a desktop restart or kill while the agent was working), or because the
 * run FAILED (a gateway outage / timeout that exhausted the driver's own retry ladder; GHE #403).
 * The host re-drives the SAME step — same correlation id, same prompt text — as a fresh queued
 * turn, with backoff, up to {@link MAX_INTERRUPTED_TURN_REDRIVES} attempts. Full design notes
 * (budget journaling, the two entry points' qualification rules) live in
 * `t3team-workflowEngineTurnRetrySupport.ts`.
 *
 * Split: constants + the shared types live in `t3team-workflowEngineTurnRetrySupport.ts`; the
 * due re-drive itself lives in `t3team-workflowEngineTurnRetryProcess.ts`. This module builds
 * the settle factory.
 *
 * @module t3team-workflowEngineTurnRetry
 */
import * as Effect from "effect/Effect";

import type { WorkflowPendingAsk, WorkflowRegisteredRun } from "./t3team-workflowEngineRegistry.ts";
import {
  interruptedTurnRetryBackoffMs,
  MAX_INTERRUPTED_TURN_REDRIVES,
  NO_TEXT_MESSAGE,
  failedTurnMessage,
  type InterruptedTurnRetry,
  type InterruptedTurnRetryDeps,
} from "./t3team-workflowEngineTurnRetrySupport.ts";
import { makeProcessTurnRetry } from "./t3team-workflowEngineTurnRetryProcess.ts";

// Re-exported so existing importers keep their import path.
export {
  MAX_INTERRUPTED_TURN_REDRIVES,
  NO_TEXT_MESSAGE,
  failedTurnMessage,
} from "./t3team-workflowEngineTurnRetrySupport.ts";
export type {
  InterruptedTurnRetry,
  InterruptedTurnRetryDeps,
} from "./t3team-workflowEngineTurnRetrySupport.ts";

export function makeInterruptedTurnRetry(deps: InterruptedTurnRetryDeps): InterruptedTurnRetry {
  /** The host-side fail funnel — the SAME closure a thrown body error takes. */
  const failRun = (
    run: WorkflowRegisteredRun,
    correlationId: string,
    error: unknown,
  ): Effect.Effect<void> =>
    Effect.promise(() =>
      run.fail === undefined ? run.resume(correlationId, "") : run.fail(error),
    );

  /**
   * Schedule the step's next re-drive, or fail the run with `exhausted` once the budget is spent.
   * `cause` is what the log line says went wrong (the settle shape), not the run's error text.
   */
  const scheduleRedrive = Effect.fn("InterruptedTurnRetry.scheduleRedrive")(function* (
    threadId: string,
    pending: WorkflowPendingAsk,
    run: WorkflowRegisteredRun,
    cause: string,
    exhausted: string,
  ) {
    const attempts = pending.turnRetries ?? 0;
    if (attempts >= MAX_INTERRUPTED_TURN_REDRIVES) {
      yield* Effect.logWarning("t3team workflow step re-drive budget exhausted", {
        threadId,
        runId: pending.runId,
        stepId: pending.correlationId,
        attempts,
        cause,
      });
      deps.registry.takePending(threadId);
      yield* failRun(run, pending.correlationId, new Error(exhausted));
      return;
    }
    // Keep the SAME ask under the SAME correlation, flagged so checks before the re-drive posts
    // its prompt do not judge the dead run again.
    deps.registry.setPending(threadId, {
      ...pending,
      turnRetries: attempts + 1,
      redriveScheduled: true,
    });
    // Journaling the attempt on the run row is the cross-restart half of the budget; a failed
    // journal write means the next restart hands the step a fresh budget, so fail-toward-retry:
    // log, keep arming.
    yield* deps.recordTurnRetries(pending.runId, attempts + 1).pipe(
      Effect.catchCause(() =>
        Effect.logWarning("t3team workflow re-drive attempt could not be journaled", {
          threadId,
          runId: pending.runId,
          stepId: pending.correlationId,
          attempt: attempts + 1,
        }),
      ),
    );
    const delayMs = interruptedTurnRetryBackoffMs(attempts, deps.backoffOverrideMs);
    yield* Effect.logInfo("t3team workflow step re-drive scheduled", {
      threadId,
      runId: pending.runId,
      stepId: pending.correlationId,
      attempt: attempts + 1,
      maxAttempts: MAX_INTERRUPTED_TURN_REDRIVES,
      delayMs,
      cause,
    });
    yield* deps.armTurnRetry(threadId, pending.correlationId, delayMs);
  });

  return {
    settleNoText: (threadId, pending, run) =>
      scheduleRedrive(
        threadId,
        pending,
        run,
        "no reply text",
        `${NO_TEXT_MESSAGE} (step ${pending.correlationId})`,
      ),

    settleFailedTurn: (threadId, pending, run, error) =>
      scheduleRedrive(
        threadId,
        pending,
        run,
        `turn failed: ${error}`,
        `${failedTurnMessage(error)} (step ${pending.correlationId}, ${MAX_INTERRUPTED_TURN_REDRIVES} re-drives exhausted)`,
      ),

    processTurnRetry: makeProcessTurnRetry({ deps, failRun }),
  };
}
