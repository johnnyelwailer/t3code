/**
 * The due re-drive of an unanswered `thread.turn` step (split out of
 * `t3team-workflowEngineTurnRetry.ts`): re-judge the step's run, consume an answer that landed in
 * the meantime, wait for a run that took the step over, or re-post the step's prompt as a fresh
 * queued turn.
 *
 * @module t3team-workflowEngineTurnRetryProcess
 */
import * as Effect from "effect/Effect";

import type { WorkflowRegisteredRun } from "./t3team-workflowEngineRegistry.ts";
import {
  PROMPT_LOST_ERROR,
  type InterruptedTurnRetryDeps,
} from "./t3team-workflowEngineTurnRetrySupport.ts";
import { newWorkflowStepPromptMessageId } from "./t3team-workflowTurnPrompt.ts";
import { readWorkflowStepPrompt, readWorkflowTurnState } from "./t3team-workflowTurnState.ts";

/** The shared closures the re-drive needs, built by `makeInterruptedTurnRetry`. */
export interface ProcessTurnRetryContext {
  readonly deps: InterruptedTurnRetryDeps;
  /** The host-side fail funnel — the SAME closure a thrown body error takes. */
  readonly failRun: (
    run: WorkflowRegisteredRun,
    correlationId: string,
    error: unknown,
  ) => Effect.Effect<void>;
}

export function makeProcessTurnRetry(ctx: ProcessTurnRetryContext) {
  const { deps, failRun } = ctx;

  return Effect.fn("InterruptedTurnRetry.processTurnRetry")(function* ({
    threadId,
    correlationId,
  }: {
    readonly threadId: string;
    readonly correlationId: string;
  }) {
    const found = deps.registry.peekPending(threadId);
    if (
      found?.kind !== "thread.turn" ||
      found.correlationId !== correlationId ||
      found.resolveLive !== undefined
    )
      return; // the ask moved on (replied, advanced, cancelled) — nothing to re-drive
    const run = deps.registry.getRun(found.runId);
    if (run === undefined) return;
    const { redriveScheduled: _scheduled, ...pending } = found;
    deps.registry.setPending(threadId, pending);

    const fail = (error: string) =>
      Effect.sync(() => deps.registry.takePending(threadId)).pipe(
        Effect.andThen(failRun(run, correlationId, new Error(error))),
      );
    const state = yield* readWorkflowTurnState(deps.threads, threadId, pending);
    if (state.kind === "missing") {
      yield* Effect.logWarning("t3team workflow step re-drive: prompt not found on thread", {
        threadId,
        stepId: correlationId,
      });
      return yield* fail(PROMPT_LOST_ERROR);
    }
    const { settlement } = state;
    if (settlement.kind === "answer") {
      // The step answered while the re-drive waited (a restart continuation finished it):
      // hand that reply to the run instead of stacking a second turn (GHE #404).
      deps.registry.takePending(threadId);
      yield* Effect.logInfo("t3team workflow step re-drive consumed the existing reply", {
        threadId,
        runId: pending.runId,
        stepId: correlationId,
      });
      return yield* Effect.promise(() => run.resume(correlationId, settlement.text));
    }
    if (settlement.kind === "pending") {
      // A run already owns the step again (a restart continuation, or a prompt still queued):
      // its own end settles the step — do not stack a second turn on top.
      return yield* Effect.logInfo("t3team workflow step re-drive skipped: step run in flight", {
        threadId,
        stepId: correlationId,
      });
    }
    const prompt = yield* readWorkflowStepPrompt(deps.threads, threadId, pending);
    if (prompt === null) return yield* fail(PROMPT_LOST_ERROR);
    const messageId = newWorkflowStepPromptMessageId(correlationId);
    // Recorded BEFORE the dispatch so a check racing it waits for this prompt's run.
    deps.registry.setPending(threadId, {
      ...pending,
      promptMessageId: messageId,
      author: prompt.author,
    });
    yield* deps.startTurn({ threadId, messageId, text: prompt.text, author: prompt.author }).pipe(
      Effect.tap(() =>
        Effect.logInfo("t3team workflow step re-drive issued", {
          threadId,
          stepId: correlationId,
          attempt: pending.turnRetries ?? 0,
        }),
      ),
      // Nothing else will settle this ask: fail the run instead of parking it forever.
      Effect.catch((error) => fail(`The interrupted step could not be re-driven: ${error}`)),
    );
  });
}
