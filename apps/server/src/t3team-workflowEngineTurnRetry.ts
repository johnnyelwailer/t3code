/**
 * Bounded re-drive of a `thread.turn` step whose provider turn never answered — because the host
 * INTERRUPTED it mid-turn (a desktop restart or kill while the agent was working), or because the
 * provider turn FAILED (a gateway outage / timeout that exhausted the driver's own retry ladder;
 * GHE #403). The host re-drives the SAME step — same correlation id, the same prompt message, via
 * the existing `thread.turn.resume` command — with backoff, up to
 * {@link MAX_INTERRUPTED_TURN_REDRIVES} attempts. Full design notes (budget journaling, the two
 * entry points' qualification rules) live in `t3team-workflowEngineTurnRetrySupport.ts`.
 *
 * Split: constants + the prompt-lookup helper + the shared types live in
 * `t3team-workflowEngineTurnRetrySupport.ts`; the due re-drive itself lives in
 * `t3team-workflowEngineTurnRetryProcess.ts`. This module builds the settle factory.
 *
 * @module t3team-workflowEngineTurnRetry
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationThread } from "@t3tools/contracts";
import type {
  WorkflowPendingAsk,
  WorkflowRegisteredRun,
} from "./t3team-workflowEngineRegistry.ts";
import {
  findInterruptedStepPrompt,
  interruptedTurnRetryBackoffMs,
  MAX_INTERRUPTED_TURN_REDRIVES,
  NO_TEXT_MESSAGE,
  PROMPT_LOST_ERROR,
  failedTurnMessage,
  type InterruptedTurnRetry,
  type InterruptedTurnRetryDeps,
} from "./t3team-workflowEngineTurnRetrySupport.ts";
import { makeProcessTurnRetry } from "./t3team-workflowEngineTurnRetryProcess.ts";

// Re-exported so existing importers keep their import path.
export {
  INTERRUPTED_TURN_RETRY_BACKOFF_MS,
  MAX_INTERRUPTED_TURN_REDRIVES,
  NO_TEXT_MESSAGE,
  findInterruptedStepPrompt,
  failedTurnMessage,
  interruptedTurnRetryBackoffMs,
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

  const readThreadSafe = (threadId: string): Effect.Effect<Option.Option<OrchestrationThread>> =>
    deps.readThread(threadId).pipe(
      // A read that cannot land cannot VERIFY the prompt; treat it as "thread unavailable"
      // (the caller then fails the run — parking it would hide the failure forever).
      Effect.catchCause(() => Effect.succeed(Option.none())),
    );

  const disarmRedrive = (threadId: string, correlationId: string): void => {
    const current = deps.registry.peekPending(threadId);
    if (
      current?.kind !== "thread.turn" ||
      current.correlationId !== correlationId ||
      current.redriveArmed !== true
    )
      return;
    const { redriveArmed: _armed, ...judging } = current;
    deps.registry.setPending(threadId, judging);
  };

  /**
   * The child already answered this step (it finished while the run was paused, or between the
   * failure and the resume): hand that reply to the run instead of stacking a second turn, which
   * the decider would reject anyway (GHE #404).
   */
  const consumeExistingAnswer = (
    threadId: string,
    pending: WorkflowPendingAsk,
    run: WorkflowRegisteredRun,
    answer: { readonly messageId: string; readonly text: string },
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const taken = deps.registry.takePending(threadId);
      if (taken?.correlationId !== pending.correlationId) return;
      yield* Effect.logInfo("t3team workflow step re-drive consumed the existing reply", {
        threadId,
        runId: pending.runId,
        stepId: pending.correlationId,
        messageId: answer.messageId,
      });
      yield* Effect.promise(() => run.resume(pending.correlationId, answer.text));
    });

  const promptFor = (threadId: string, pending: WorkflowPendingAsk) =>
    Effect.gen(function* () {
      const thread = Option.getOrUndefined(yield* readThreadSafe(threadId));
      return thread === undefined
        ? null
        : findInterruptedStepPrompt(thread, pending.runId, pending.correlationId);
    });

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
      yield* failRun(run, pending.correlationId, new Error(exhausted));
      return;
    }
    const prompt = yield* promptFor(threadId, pending);
    if (prompt === null) {
      yield* failRun(run, pending.correlationId, new Error(PROMPT_LOST_ERROR));
      return;
    }
    // Re-register the SAME ask under the SAME correlation: the re-driven turn's reply
    // settles through the ordinary path and resumes the run on this step. The author is
    // restored from the prompt's stamp so the re-driven answer keeps its attribution.
    deps.registry.setPending(threadId, {
      ...pending,
      turnRetries: attempts + 1,
      author: prompt.author,
      // Ignore the dead session's tail writes until the re-driven turn actually starts.
      redriveArmed: true,
    });
    // Journaling the attempt on the run row is the cross-restart half of the budget; a
    // failed journal write means the next restart hands the step a fresh budget, so
    // fail-toward-retry: log, keep arming.
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

  const processTurnRetry = makeProcessTurnRetry({
    deps,
    failRun,
    readThreadSafe,
    disarmRedrive,
    consumeExistingAnswer,
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

    processTurnRetry,
  };
}
