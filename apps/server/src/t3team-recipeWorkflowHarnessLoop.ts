/**
 * Ask/answer + completion polling for the recipe E2E harness (Epic 25 §Host wiring).
 *
 * Drives a launched run to a terminal state: answer each `askUser` the registry surfaces, in spec
 * order, and watch the durable run row for the completion the reactor path produces.
 */
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { answerT3TeamRecipeHarnessAsk } from "./t3team-recipeWorkflowHarnessStub.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";

export function driveT3TeamRecipeHarnessAsks(input: {
  readonly runId: string;
  readonly launchThreadId: string;
  /** Deterministic answers for each `askUser`, in order. */
  readonly answers: ReadonlyArray<string>;
  /** Live array the launch's `onComplete` sink pushes into; read for its length only. */
  readonly completed: ReadonlyArray<unknown>;
  readonly launchStatus: string;
  readonly timeoutMs: number;
}) {
  return Effect.gen(function* () {
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const runRepository = yield* WorkflowRunRepository;
    const { answers, completed, launchThreadId, runId } = input;

    let asksAnswered = 0;
    const answeredCorrelations = new Set<string>();
    // Completion is read from the DURABLE ROW, not from the launch-time `onComplete`
    // callback: when the reactor resumes a suspended run and finishes it, that callback
    // belongs to the original launch invocation and never fires. The row is deleted on
    // completion, so `getById` returning None IS the terminal signal.
    const runGone = Effect.gen(function* () {
      const row = yield* runRepository.getById({ runId });
      return Option.isNone(row);
    });
    let finished = input.launchStatus === "completed" || completed.length > 0;
    while (!finished) {
      const nextAsk = (): string | undefined => {
        const pending = registry.peekPending(launchThreadId);
        return pending?.kind === "user.input" && !answeredCorrelations.has(pending.correlationId)
          ? pending.correlationId
          : undefined;
      };
      // Poll the row alongside the in-memory signals; a run that completed through the
      // reactor shows up here and nowhere else.
      const deadline = input.timeoutMs;
      let waited = 0;
      while (waited < deadline) {
        if (completed.length > 0 || nextAsk() !== undefined || (yield* runGone)) break;
        yield* Effect.sleep(Duration.millis(10));
        waited += 10;
      }
      if (yield* runGone) {
        finished = true;
        break;
      }
      const correlationId = nextAsk();
      if (completed.length > 0 || correlationId === undefined) {
        finished = true;
        break;
      }
      answeredCorrelations.add(correlationId);
      yield* answerT3TeamRecipeHarnessAsk({
        launchThreadId,
        answer: answers[asksAnswered] ?? "{}",
        nonce: `${runId}-${asksAnswered}`,
      });
      asksAnswered += 1;
      if (asksAnswered > answers.length + 2) {
        return yield* Effect.die(new Error("harness answered more asks than the spec provides"));
      }
    }
    return asksAnswered;
  });
}
