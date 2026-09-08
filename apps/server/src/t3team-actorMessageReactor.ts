/**
 * Reactor that turns a delivered inter-agent ("actor") message into a reaction
 * turn on the receiving thread.
 *
 * Design notes (F1 sendTurn framing, F2 admission + mailbox serialization,
 * coalescing semantics): see the module docs of
 * `t3team-actorMessageReactorLimits.ts` and `t3team-actorMessageReactorEvents.ts`.
 *
 * @module t3team-actorMessageReactor
 */
import { ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { makeT3TeamActorMailbox } from "./t3team-actorMailbox.ts";
import { rehydrateActorMailbox } from "./t3team-actorMailboxRehydrate.ts";
import { startActorReaction, startActorRestartHoldSummary } from "./t3team-actorMessageReaction.ts";
import { loadInterruptedChildThreads } from "./t3team-actorRestartHold.ts";
import {
  isThreadBusy,
  resolveActorMessageBatchMax,
  resolveActorMessageDebounceMs,
  T3TEAM_ACTOR_MESSAGE_HOP_CAP,
} from "./t3team-actorMessageReactorLimits.ts";
import { createActorMessageEventHandler } from "./t3team-actorMessageReactorEvents.ts";

export const T3TeamActorMessageReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const mailbox = yield* makeT3TeamActorMailbox;
    const debounceMs = resolveActorMessageDebounceMs();
    const batchMax = resolveActorMessageBatchMax();
    // The restart-held set (GHE #155): captured from rehydrate below; declared
    // first so surfaceHoldSummary's closure binds it without a use-before-
    // declaration. Mutable: a thread is consumed (deleted) the first time its
    // hold is surfaced, so a later clean settle drains normally instead of
    // re-surfacing a summary (e.g. repeatedly listing a still-stopped child).
    let heldAtRehydrate: Set<string> = new Set();

    const loadThread = (threadId: string) =>
      query.getThreadDetailById(ThreadId.make(threadId)).pipe(
        Effect.orElseSucceed(() => Option.none()),
        Effect.map(Option.getOrUndefined),
      );

    // Claim-and-dispatch: only when the thread is neither reacting nor otherwise
    // running does a queued batch become a reaction turn. The drain is FORKED
    // (a domain-event must never block the stream on the debounce window) and
    // debounced: it waits the window, then claims the whole pending batch so a
    // burst of deliveries coalesces into ONE turn. The atomic claim plus the
    // `reacting` flag keep per-thread serialization: concurrent drains for the
    // same thread race to the claim, and only the first wins a non-empty batch.
    const tryDrain = (threadId: string) =>
      Effect.gen(function* () {
        if (yield* mailbox.isReacting(threadId)) {
          return;
        }
        const thread = yield* loadThread(threadId);
        if (!thread || isThreadBusy(thread)) {
          return;
        }
        // Coalescing window: deliveries enqueued while we wait join this batch.
        yield* Effect.sleep(Duration.millis(debounceMs));
        // Re-check after the window: a user turn may have started while we
        // waited. If so, abort — the turn-settle drain picks the queue up.
        const settled = yield* loadThread(threadId);
        if (!settled || isThreadBusy(settled)) {
          return;
        }
        const batch = yield* mailbox.takeNextForDispatch(threadId, batchMax);
        if (batch.length === 0) {
          return;
        }
        yield* startActorReaction({ engine, mailbox, threadId, loadThread, entries: batch });
      }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("t3team actor-message drain failed", {
                threadId,
                cause: Cause.pretty(cause),
              }),
        ),
        Effect.forkDetach,
      );

    // Restart hold (GHE #155): a RESTART-held thread (suppressed at
    // rehydrate because it had pending deliveries or a stale running session)
    // whose turn just settled cleanly was CONTINUED by the user — surface its
    // held work as ONE summary turn (interrupted children + one line per held
    // message), not one turn per held message. The user's continue is the
    // explicit lift: clear suppression, then claim the whole held batch with
    // the ordinary atomic claim (no cap = everything). A racing live-delivery
    // drain still loses atomically to exactly one turn. Scoped to the
    // rehydrate-held set so a user-stop suppression on any other thread keeps
    // its current semantics (no auto-dispatch until a real user message).
    // Forked like tryDrain: the descendant walk is SQL and must never block
    // the domain-event stream.
    const surfaceHoldSummary = (threadId: string) =>
      Effect.gen(function* () {
        if (!heldAtRehydrate.has(threadId)) {
          return yield* tryDrain(threadId);
        }
        // Consume the hold NOW: after this settle the thread is no longer
        // restart-held, so subsequent clean settles drain normally (no
        // repeated summaries). The claim below still serializes against any
        // racing live-delivery drain.
        heldAtRehydrate.delete(threadId);
        const interrupted = yield* loadInterruptedChildThreads(threadId, query);
        const batch = yield* mailbox
          .clearSuppression(threadId)
          .pipe(Effect.andThen(() => mailbox.takeNextForDispatch(threadId)));
        if (batch.length === 0 && interrupted.length === 0) {
          // Nothing held: the hold is lifted and the thread behaves normally.
          return;
        }
        // If the summary turn fails to start, the claimed entries are requeued
        // by the dispatcher and the ordinary drain picks them up on the next
        // settle.
        yield* startActorRestartHoldSummary({
          engine,
          mailbox,
          threadId,
          loadThread,
          entries: batch,
          interruptedChildren: interrupted,
        });
      }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("t3team restart-hold summary failed", {
                threadId,
                cause: Cause.pretty(cause),
              }),
        ),
        Effect.forkDetach,
      );

    const { handleSafely } = createActorMessageEventHandler({
      mailbox,
      tryDrain,
      surfaceHoldSummary,
    });

    yield* Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely));
    heldAtRehydrate = yield* rehydrateActorMailbox({
      engine,
      mailbox,
      hopCap: T3TEAM_ACTOR_MESSAGE_HOP_CAP,
    });
  }),
);
