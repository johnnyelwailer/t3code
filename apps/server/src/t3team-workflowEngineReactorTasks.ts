/**
 * What the workflow-engine reactor DOES with one domain event or one due turn settlement, split
 * out of `t3team-workflowEngineReactor.ts` (which owns the layer, the serial workers and the
 * subscription) to keep each module inside the prefixed-file LOC ceiling.
 *
 * The rules in one place:
 *   • assistant text arrives on `streaming: true` deltas; the `streaming: false` marker only
 *     CLOSES a message. A closed message is a candidate answer, never the settlement — the turn
 *     may still narrate, call tools, and answer afterwards (see t3team-workflowTurnResolution.ts).
 *   • the turn-end signal is a `thread.session-set` with no active turn; it ARMS the settle.
 *   • a `user.input` ask settles on the user's reply message, as it always has.
 *   • a settlement with no substantive text: a LIVE (black-boxed) ask settles with "" so the
 *     composition's own emptiness check fires; a durable ask whose turn was INTERRUPTED by a
 *     host restart gets its bounded re-drive (t3team-workflowEngineTurnRetry.ts) instead of a
 *     terminal failure; a durable ask set live this uptime fails the run.
 */

import type { OrchestrationCommand, OrchestrationEvent } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import {
  isWorkflowAttributed,
  workflowAnswerAttributionCommand,
} from "./t3team-workflowAnswerAttribution.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

import type {
  T3TeamWorkflowEngineRegistryShape,
  WorkflowPendingAsk,
} from "./t3team-workflowEngineRegistry.ts";
import { settleUnansweredTurn } from "./t3team-workflowEngineReactorUnanswered.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";
import type { WorkflowTurnTracker } from "./t3team-workflowTurnResolution.ts";

export type ThreadMessageSentEvent = Extract<OrchestrationEvent, { type: "thread.message-sent" }>;
export type ThreadSessionSetEvent = Extract<OrchestrationEvent, { type: "thread.session-set" }>;

/** One unit of serialized reactor work: an event to fold in, a due turn settlement, or a due
 * re-drive of an interrupted step. */
export type WorkflowReactorTask =
  | { readonly kind: "event"; readonly event: ThreadMessageSentEvent | ThreadSessionSetEvent }
  | { readonly kind: "settle"; readonly threadId: string; readonly correlationId: string }
  | { readonly kind: "turn-retry"; readonly threadId: string; readonly correlationId: string };

export interface WorkflowReactorTaskDeps {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly tracker: WorkflowTurnTracker;
  /** Queue the settlement for a turn that just ended, after the straggler grace window. */
  readonly armSettle: (threadId: string, correlationId: string) => Effect.Effect<void>;
  /** The bounded re-drive of an interrupted step (see t3team-workflowEngineTurnRetry.ts). */
  readonly turnRetry: InterruptedTurnRetry;
  /** Dispatch a command — used ONLY to attribute a step's answer to the step (see
   * t3team-workflowAnswerAttribution.ts). Absent leaves answers unattributed. */
  readonly dispatch?: (command: OrchestrationCommand) => Effect.Effect<unknown>;
}

export function createWorkflowReactorTaskHandler(
  deps: WorkflowReactorTaskDeps,
): (task: WorkflowReactorTask) => Effect.Effect<void> {
  const { registry, tracker } = deps;

  const settle = (pending: WorkflowPendingAsk, reply: unknown): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (pending.resolveLive !== undefined) {
        return Effect.promise(() => pending.resolveLive!(reply));
      }
      const run = registry.getRun(pending.runId);
      if (run === undefined) return Effect.void;
      return Effect.promise(() => run.resume(pending.correlationId, reply));
    });

  const processMessageSent = (event: ThreadMessageSentEvent) =>
    Effect.gen(function* () {
      const { threadId, messageId, role, streaming, text } = event.payload;
      const awaited = registry.peekPending(threadId);
      const awaitedTurn = awaited?.kind === "thread.turn" ? awaited : undefined;

      if (streaming) {
        // Buffered only while a turn is parked on this thread, so ordinary chat streaming is
        // never retained.
        if (role === "assistant" && awaitedTurn !== undefined) {
          tracker.appendDelta(threadId, awaitedTurn.correlationId, messageId, text);
        }
        return;
      }
      if (role !== "assistant" && role !== "user") return;

      if (role === "assistant") {
        // Our own attribution upsert comes back as a completed assistant message. Ignoring it keeps
        // the stamp from looping and keeps the message from counting twice as a candidate answer.
        if (isWorkflowAttributed(event.payload.t3teamExt)) return;
        if (awaitedTurn === undefined) {
          tracker.forget(threadId);
          return;
        }
        const answer = tracker.completeMessage(
          threadId,
          awaitedTurn.correlationId,
          messageId,
          text,
        );
        // Attribute the reply to the step that asked for it, so the client can collapse it under the
        // same label as the prompt instead of rendering workflow output as ordinary chat.
        if (
          answer !== undefined &&
          awaitedTurn.author !== undefined &&
          deps.dispatch !== undefined
        ) {
          yield* deps.dispatch(
            workflowAnswerAttributionCommand({
              threadId,
              messageId,
              text: answer,
              turnId: event.payload.turnId,
              author: awaitedTurn.author,
              commandId: t3teamRandomUUID(),
              createdAt: DateTime.formatIso(yield* DateTime.now),
            }),
          );
        }
        return;
      }

      // A widget action starts an agent turn, but is not an answer to a workflow decision. Ignore
      // it before taking the pending ask so a widget beside an askUser card cannot accidentally
      // resume the workflow with its button label.
      if (event.payload.t3teamExt?.widgetReply !== undefined) return;

      const pending = registry.takePending(threadId);
      if (pending === undefined) return;
      if (pending.kind !== "user.input") {
        // Not the event this ask awaits (the engine's own dispatched turn prompt, or a steer
        // typed while the agent works) — re-register so the right event still settles it.
        registry.setPending(threadId, pending);
        return;
      }

      // A structured decision reply is pinned to its ask: the resolve route's staleness check is
      // a read-only peek that two in-flight replies can both pass, so the take here is the
      // authoritative point — a reply authored for a DIFFERENT (already-resolved) ask must not
      // answer the newer pending one.
      const workflowReply = event.payload.t3teamExt?.workflowReply;
      if (
        workflowReply?.correlationId !== undefined &&
        workflowReply.correlationId !== pending.correlationId
      ) {
        registry.setPending(threadId, pending);
        return;
      }
      yield* settle(pending, workflowReply === undefined ? text : workflowReply.value);
    });

  const processSessionSet = (event: ThreadSessionSetEvent) =>
    Effect.gen(function* () {
      const { threadId, session } = event.payload;
      const pending = registry.peekPending(threadId);
      if (pending?.kind !== "thread.turn") return;
      const note = tracker.noteSession(threadId, pending.correlationId, {
        status: session.status,
        activeTurnId: session.activeTurnId,
        lastError: session.lastError,
      });
      if (note === "ended") yield* deps.armSettle(threadId, pending.correlationId);
    });

  const processSettle = (task: Extract<WorkflowReactorTask, { kind: "settle" }>) =>
    Effect.gen(function* () {
      const settlement = tracker.take(task.threadId, task.correlationId);
      if (settlement.kind === "stale") return;
      const pending = registry.peekPending(task.threadId);
      if (pending?.kind !== "thread.turn" || pending.correlationId !== task.correlationId) return;
      registry.takePending(task.threadId);
      if (settlement.kind === "answer") {
        yield* settle(pending, settlement.text);
        return;
      }
      // No answer: the turn died or said nothing — see t3team-workflowEngineReactorUnanswered.ts
      // for which of those re-drives the step, fails the run, or settles a composition ask.
      yield* settleUnansweredTurn(
        { registry, turnRetry: deps.turnRetry },
        { threadId: task.threadId, pending, settlement },
      );
    });

  return (task) => {
    if (task.kind === "settle") return processSettle(task);
    if (task.kind === "turn-retry") return deps.turnRetry.processTurnRetry(task);
    return task.event.type === "thread.message-sent"
      ? processMessageSent(task.event)
      : processSessionSet(task.event);
  };
}
