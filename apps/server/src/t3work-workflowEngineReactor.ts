/**
 * The workflow-engine resume reactor (Epic 25 §Host wiring) — the one genuinely new
 * production mechanism. It watches orchestration domain events and turns a completed agent
 * turn / a user reply into `appendResolvedEntry` + `resumeWorkflow`, driving a parked run
 * forward.
 *
 * For each `thread.message-sent` event it reads the pending ask the workflow registered for
 * that thread:
 *   • a final assistant message (`role: "assistant"`, `streaming: false`) resolves a
 *     `thread.turn` (an `askAgent` / `agent` call) with the assistant text;
 *   • a user message resolves a `user.input` (an `askUser` call) with the user's text.
 * A message that does not match the pending ask's kind (e.g. the user-role prompt the engine
 * itself dispatched to start a turn) is left pending so the right event still resolves it.
 *
 * ── Assembling the assistant reply ──────────────────────────────────────────
 * The final `streaming: false` assistant `thread.message-sent` is only a "this message is
 * complete" marker: its `text` is the empty string (see the decider's
 * `thread.message.assistant.complete` case + `ProviderRuntimeIngestion.finalizeAssistantMessage`).
 * The assistant's actual text arrives in the `streaming: true` delta events that precede it
 * (one full-text delta in buffered mode, many chunks in streaming mode), all sharing the
 * `messageId`. So the reactor accumulates assistant deltas per `messageId` while a turn is
 * awaited on that thread, then resolves the turn with the assembled text when the
 * `streaming: false` marker lands. Reading `event.payload.text` off the final event directly
 * would resolve every agent turn with `""` — the interactive model would silently not work.
 *
 * Events are drained through a single worker so resumes never interleave: `resume` awaits the
 * replay to its next suspension (which re-registers the new pending ask) before the next event
 * is processed.
 */

import type { OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3workWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import { stopWorkflowsOwnedByThread } from "./t3work-workflowStopCascade.ts";

type ThreadMessageSentEvent = Extract<OrchestrationEvent, { type: "thread.message-sent" }>;

export const T3workWorkflowEngineReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const registry = yield* T3workWorkflowEngineRegistry;

    // Assistant text assembled from `streaming: true` deltas, keyed by `messageId`. Only threads
    // a workflow is currently awaiting a turn on are buffered, so this stays bounded to in-flight
    // agent turns; each entry is taken (or dropped) the moment its `streaming: false` marker lands.
    const assistantTextByMessageId = new Map<string, string>();

    const processMessageSent = Effect.fn("processWorkflowEngineMessageSent")(function* (
      event: ThreadMessageSentEvent,
    ) {
      const { threadId, messageId, role, streaming, text } = event.payload;

      if (streaming) {
        // The reply text rides on the streaming deltas; the final marker carries none. Buffer the
        // assistant deltas, but only while a turn is parked on this thread (so non-workflow chat
        // streaming is not retained).
        if (role === "assistant" && registry.peekPending(threadId)?.kind === "thread.turn") {
          assistantTextByMessageId.set(
            messageId,
            (assistantTextByMessageId.get(messageId) ?? "") + text,
          );
        }
        return;
      }
      if (role !== "assistant" && role !== "user") return;

      const pending = registry.takePending(threadId);
      if (pending === undefined) {
        assistantTextByMessageId.delete(messageId);
        return;
      }

      const expected = role === "assistant" ? "thread.turn" : "user.input";
      if (pending.kind !== expected) {
        // Not the event this ask awaits (e.g. the engine's own dispatched user prompt that
        // starts a turn) — re-register so the correct event can resolve it. Leave any buffered
        // assistant text in place; the turn's own `streaming: false` marker will consume it.
        registry.setPending(threadId, pending);
        return;
      }

      const run = registry.getRun(pending.runId);
      if (run === undefined) {
        assistantTextByMessageId.delete(messageId);
        return;
      }

      // A structured decision reply is pinned to its ask: the route's staleness check is a
      // read-only peek that two in-flight replies can both pass, so the take here is the
      // authoritative point — a reply authored for a DIFFERENT (already-resolved) ask must not
      // answer the newer pending one. Re-register and ignore it.
      const workflowReply = role === "user" ? event.payload.t3workExt?.workflowReply : undefined;
      if (
        workflowReply?.correlationId !== undefined &&
        workflowReply.correlationId !== pending.correlationId
      ) {
        registry.setPending(threadId, pending);
        return;
      }

      // An assistant turn resolves with its assembled delta text (the marker's own text is "");
      // a user reply resolves with the structured decision value when the resolve route attached
      // one (`t3workExt.workflowReply`, e.g. a decision-card choice), else the message text.
      const assembled = assistantTextByMessageId.get(messageId);
      assistantTextByMessageId.delete(messageId);
      const reply =
        role === "assistant"
          ? (assembled ?? text)
          : workflowReply !== undefined
            ? workflowReply.value
            : text;
      if (pending.resolveLive) {
        yield* Effect.promise(() => pending.resolveLive!(reply));
        return;
      }
      yield* Effect.promise(() => run.resume(pending.correlationId, reply));
    });

    const processSafely = (event: ThreadMessageSentEvent) =>
      processMessageSent(event).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
          return Effect.logWarning("t3work workflow-engine reactor failed to process event", {
            eventType: event.type,
            threadId: event.payload.threadId,
            cause: Cause.pretty(cause),
          });
        }),
      );

    const worker = yield* makeDrainableWorker(processSafely);
    // A durable resume may replay into a live composition (for example parallel(agent(...))).
    // That replay waits for its live child turns. If those replies use the same serial worker,
    // the worker waits for the replay while the replay waits for events queued behind itself.
    // Keep live settlements ordered on a separate lane so they can unblock the parent replay.
    const liveWorker = yield* makeDrainableWorker(processSafely);

    const stopOwnedWorkflows = Effect.fn("stopOwnedWorkflows")(function* (
      event: Extract<OrchestrationEvent, { type: "thread.turn-interrupt-requested" }>,
    ) {
      yield* Effect.promise(() =>
        stopWorkflowsOwnedByThread({
          registry,
          threadId: event.payload.threadId,
          createdAt: event.payload.createdAt,
          dispatch: (command) =>
            Effect.runPromise(orchestration.dispatch(command)).then(() => undefined),
        }),
      );
    });

    yield* Effect.forkScoped(
      Stream.runForEach(orchestration.streamDomainEvents, (event) => {
        if (event.type === "thread.message-sent") {
          return registry.peekPending(event.payload.threadId)?.resolveLive === undefined
            ? worker.enqueue(event)
            : liveWorker.enqueue(event);
        }
        if (event.type === "thread.turn-interrupt-requested") return stopOwnedWorkflows(event);
        return Effect.void;
      }),
    );
  }),
);
