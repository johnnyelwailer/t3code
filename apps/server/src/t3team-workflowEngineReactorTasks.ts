/**
 * What the workflow-engine reactor DOES with one unit of work, split out of
 * `t3team-workflowEngineReactor.ts` (which owns the layer, the serial lanes, the event
 * subscription and the sweep) to keep each module inside the prefixed-file LOC ceiling.
 *
 * The rules in one place:
 *   • an `askAgent` (`thread.turn`) ask settles when the RUN its prompt started reaches a
 *     terminal status — never on an intermediate assistant message (the turn may still narrate,
 *     call tools, and answer afterwards). `check` reads the step's run and judges it
 *     (t3team-workflowTurnRun.ts); it is idempotent, so the terminal `run.updated`, the durable
 *     sweep and boot rehydration can all trigger it.
 *   • a `user.input` ask settles on the next message a PERSON posts on the thread (or the resolve
 *     route's reply); a widget action is not an answer, and a reply pinned to another ask is not
 *     this one's.
 *   • a step whose run ended without an answer goes through t3team-workflowEngineReactorUnanswered.ts
 *     (re-drive, fail, or settle a composition ask with "").
 */
import {
  type OrchestrationV2ConversationMessage,
  readT3TeamMessageExtContext,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type {
  T3TeamWorkflowEngineRegistryShape,
  WorkflowPendingAsk,
} from "./t3team-workflowEngineRegistry.ts";
import { settleUnansweredTurn } from "./t3team-workflowEngineReactorUnanswered.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";
import { PROMPT_LOST_ERROR } from "./t3team-workflowEngineTurnRetrySupport.ts";
import { readWorkflowTurnState, type WorkflowTurnReads } from "./t3team-workflowTurnState.ts";

/** One unit of serialized reactor work. */
export type WorkflowReactorTask =
  /** Re-judge the thread's pending `askAgent` step (its run may have ended). */
  | { readonly kind: "check"; readonly threadId: string }
  /** A message a person posted on the thread — the answer to a pending `askUser`. */
  | {
      readonly kind: "user-message";
      readonly threadId: string;
      readonly message: OrchestrationV2ConversationMessage;
    }
  /** A due re-drive of an unanswered step. */
  | { readonly kind: "turn-retry"; readonly threadId: string; readonly correlationId: string };

export interface WorkflowReactorTaskDeps {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly threads: WorkflowTurnReads;
  /** The bounded re-drive of an unanswered step (see t3team-workflowEngineTurnRetry.ts). */
  readonly turnRetry: InterruptedTurnRetry;
  /** Attribute a step's answer to the step (cosmetic: failures are the caller's to swallow). */
  readonly attributeAnswer?: (input: {
    readonly threadId: string;
    readonly messageId: string;
    readonly pending: WorkflowPendingAsk;
  }) => Effect.Effect<void>;
}

export function createWorkflowReactorTaskHandler(
  deps: WorkflowReactorTaskDeps,
): (task: WorkflowReactorTask) => Effect.Effect<void> {
  const { registry } = deps;

  const settle = (pending: WorkflowPendingAsk, reply: unknown): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (pending.resolveLive !== undefined) {
        return Effect.promise(() => pending.resolveLive!(reply));
      }
      const run = registry.getRun(pending.runId);
      if (run === undefined) return Effect.void;
      return Effect.promise(() => run.resume(pending.correlationId, reply));
    });

  /** True while `pending` is still the thread's ask (a concurrent lane did not move it on). */
  const isCurrent = (threadId: string, pending: WorkflowPendingAsk) =>
    registry.peekPending(threadId)?.correlationId === pending.correlationId;

  const check = (threadId: string) =>
    Effect.gen(function* () {
      const pending = registry.peekPending(threadId);
      if (pending?.kind !== "thread.turn" || pending.redriveScheduled === true) return;
      const run = registry.getRun(pending.runId);
      if (run === undefined && pending.resolveLive === undefined) {
        // The run that parked here was settled or stopped elsewhere: drop the stale ask.
        registry.takePending(threadId);
        return;
      }
      const state = yield* readWorkflowTurnState(deps.threads, threadId, pending);
      if (!isCurrent(threadId, pending)) return;
      // A failed read says nothing about the step: stay parked, the sweep looks again.
      if (state.kind === "unreadable") return;
      if (state.kind === "missing") {
        registry.takePending(threadId);
        yield* Effect.logWarning("t3team workflow step prompt is not on its thread", {
          threadId,
          stepId: pending.correlationId,
        });
        if (pending.resolveLive !== undefined) return yield* settle(pending, "");
        if (run?.fail !== undefined)
          yield* Effect.promise(() => run.fail!(new Error(PROMPT_LOST_ERROR)));
        return;
      }
      const { settlement } = state;
      if (settlement.kind === "pending") return;
      registry.takePending(threadId);
      if (settlement.kind === "answer") {
        if (settlement.messageId !== null && deps.attributeAnswer !== undefined) {
          yield* deps.attributeAnswer({ threadId, messageId: settlement.messageId, pending });
        }
        return yield* settle(pending, settlement.text);
      }
      // No answer: the run died or said nothing — see t3team-workflowEngineReactorUnanswered.ts
      // for which of those re-drives the step, fails the run, or settles a composition ask.
      yield* settleUnansweredTurn(
        { registry, turnRetry: deps.turnRetry },
        { threadId, pending: { ...pending, promptMessageId: state.promptMessageId }, settlement },
      );
    });

  const userMessage = (threadId: string, message: OrchestrationV2ConversationMessage) =>
    Effect.gen(function* () {
      // Only what a person said answers an `askUser`: workflow prompts, agent messages and
      // server framing on the same thread never do.
      if (message.role !== "user" || message.createdBy !== "user") return;
      const ext = readT3TeamMessageExtContext(message.context);
      // A widget action starts an agent turn, but is not an answer to a workflow decision.
      if (ext?.widgetReply !== undefined) return;
      const pending = registry.peekPending(threadId);
      if (pending?.kind !== "user.input") return;
      // A structured decision reply is pinned to its ask: a reply authored for a DIFFERENT
      // (already-resolved) ask must not answer the newer pending one.
      const reply = ext?.workflowReply;
      if (reply?.correlationId !== undefined && reply.correlationId !== pending.correlationId) {
        return;
      }
      registry.takePending(threadId);
      yield* settle(pending, reply === undefined ? message.text : reply.value);
    });

  return (task) => {
    if (task.kind === "check") return check(task.threadId);
    if (task.kind === "turn-retry") return deps.turnRetry.processTurnRetry(task);
    return userMessage(task.threadId, task.message);
  };
}
