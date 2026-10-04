/**
 * The due re-drive for an interrupted `thread.turn` step (split out of
 * `t3team-workflowEngineTurnRetry.ts`): re-validate the prompt, consume an
 * already-answered reply, or re-issue the step's prompt turn via
 * `thread.turn.resume`.
 *
 * @module t3team-workflowEngineTurnRetryProcess
 */
import {
  CommandId,
  MessageId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  findCompletedAnswer,
  isAnsweredPromptInvariant,
  promptIsLatestUserMessage,
} from "./t3team-workflowTurnAnswerLookup.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type { WorkflowPendingAsk, WorkflowRegisteredRun } from "./t3team-workflowEngineRegistry.ts";
import {
  findInterruptedStepPrompt,
  interruptedTurnRetryBackoffMs,
  MAX_INTERRUPTED_TURN_REDRIVES,
  PROMPT_LOST_ERROR,
  type InterruptedTurnRetryDeps,
} from "./t3team-workflowEngineTurnRetrySupport.ts";

/** The shared closures the re-drive needs, built by `makeInterruptedTurnRetry`. */
export interface ProcessTurnRetryContext {
  readonly deps: InterruptedTurnRetryDeps;
  /** The host-side fail funnel — the SAME closure a thrown body error takes. */
  readonly failRun: (
    run: WorkflowRegisteredRun,
    correlationId: string,
    error: unknown,
  ) => Effect.Effect<void>;
  /** Thread read that swallows a failed read as "thread unavailable". */
  readonly readThreadSafe: (threadId: string) => Effect.Effect<Option.Option<OrchestrationThread>>;
  /** Clear the `redriveArmed` flag when the in-flight turn is confirmed to be ours. */
  readonly disarmRedrive: (threadId: string, correlationId: string) => void;
  /** Hand an already-present reply to the run instead of stacking a second turn. */
  readonly consumeExistingAnswer: (
    threadId: string,
    pending: WorkflowPendingAsk,
    run: WorkflowRegisteredRun,
    answer: { readonly messageId: string; readonly text: string },
  ) => Effect.Effect<void>;
}

/** The due re-drive: re-validate, then re-issue the step's prompt turn. */
export function makeProcessTurnRetry(ctx: ProcessTurnRetryContext) {
  const { deps, failRun, readThreadSafe, disarmRedrive, consumeExistingAnswer } = ctx;

  return Effect.fn("InterruptedTurnRetry.processTurnRetry")(function* ({
    threadId,
    correlationId,
  }: {
    readonly threadId: string;
    readonly correlationId: string;
  }) {
    const pending = deps.registry.peekPending(threadId);
    if (
      pending?.kind !== "thread.turn" ||
      pending.correlationId !== correlationId ||
      pending.resolveLive !== undefined
    )
      return; // the ask moved on (replied, advanced, cancelled) — nothing to re-drive
    const run = deps.registry.getRun(pending.runId);
    if (run === undefined) return;

    const thread = Option.getOrUndefined(yield* readThreadSafe(threadId));
    const prompt =
      thread === undefined ? null : findInterruptedStepPrompt(thread, pending.runId, correlationId);
    if (prompt === null) {
      yield* Effect.logWarning("t3team workflow step re-drive: prompt not found on thread", {
        threadId,
        stepId: correlationId,
        threadRead: thread !== undefined,
        messages: thread?.messages.length ?? 0,
      });
      yield* failRun(run, correlationId, new Error(PROMPT_LOST_ERROR));
      return;
    }
    // The reply already exists (the child finished while the run was paused): consume it.
    const answered = thread === undefined ? null : findCompletedAnswer(thread, prompt.messageId);
    if (answered !== null) {
      yield* consumeExistingAnswer(threadId, pending, run, answered);
      return;
    }
    // A turn is in flight. If our prompt is still the thread's last user message, that turn IS
    // the step (its own settle decides it — do not stack a second turn on top). Otherwise a
    // human steer or another automation owns it: stay armed and look again after the backoff,
    // rather than adopting a reply that answers a different prompt (GHE #405).
    const status = thread?.session?.status;
    if (status === "running" || status === "starting") {
      const ours = thread !== undefined && promptIsLatestUserMessage(thread, prompt.messageId);
      if (ours) disarmRedrive(threadId, correlationId);
      else {
        yield* deps.armTurnRetry(
          threadId,
          correlationId,
          interruptedTurnRetryBackoffMs(MAX_INTERRUPTED_TURN_REDRIVES, deps.backoffOverrideMs),
        );
      }
      yield* Effect.logInfo("t3team workflow interrupted step re-drive skipped: thread busy", {
        threadId,
        stepId: correlationId,
        status,
        ours,
      });
      return;
    }
    const command: OrchestrationCommand = {
      type: "thread.turn.resume",
      commandId: CommandId.make(`server:t3team:wf-turn-retry:${t3teamRandomUUID()}`),
      threadId: ThreadId.make(threadId),
      messageId: MessageId.make(prompt.messageId),
      createdAt: DateTime.formatIso(yield* DateTime.now),
    };
    yield* deps.dispatch(command).pipe(
      Effect.catch((error) => {
        // Decider invariant: a turn is ALREADY in progress — that turn's own settle will
        // decide this step, so leave it parked (fail-open, as the transient turn retry).
        if (
          error._tag === "OrchestrationCommandInvariantError" &&
          error.detail.includes("turn in progress")
        ) {
          disarmRedrive(threadId, correlationId);
          return Effect.logInfo(
            "t3team workflow interrupted step re-drive skipped: turn in progress",
            { threadId, stepId: correlationId },
          );
        }
        // The thread already ends in a reply to our prompt (the projection we read was
        // stale): consume it instead of failing the run.
        if (
          error._tag === "OrchestrationCommandInvariantError" &&
          isAnsweredPromptInvariant(error.detail)
        ) {
          return readThreadSafe(threadId).pipe(
            Effect.flatMap((fresh) => {
              const thread = Option.getOrUndefined(fresh);
              const late =
                thread === undefined ? null : findCompletedAnswer(thread, prompt.messageId);
              return late === null
                ? failRun(run, correlationId, new Error(PROMPT_LOST_ERROR))
                : consumeExistingAnswer(threadId, pending, run, late);
            }),
          );
        }
        // Any other dispatch failure cannot recover on its own (nothing else will settle
        // this ask): fail the run instead of parking it forever.
        return Effect.logWarning("t3team workflow interrupted step re-drive dispatch failed", {
          threadId,
          stepId: correlationId,
          error: error.message,
        }).pipe(
          Effect.andThen(
            failRun(
              run,
              correlationId,
              new Error(`The interrupted step could not be re-driven: ${error.message}`),
            ),
          ),
        );
      }),
      Effect.andThen(() =>
        Effect.logInfo("t3team workflow interrupted step re-issued", {
          threadId,
          stepId: correlationId,
          attempt: pending.turnRetries ?? 0,
        }),
      ),
    );
  });
}
