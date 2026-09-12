/**
 * Reactor that turns a DELIVERED BATCH of inter-agent ("actor") messages into
 * a single consolidated digest turn on the receiving thread.
 *
 * Delivery model (inter-agent messaging overhaul): messages do NOT drive
 * individual turns. They accumulate in the mailbox and are claimed as ONE
 * batch at a boundary — the thread is idle (`isThreadBusy`), not reacting and
 * not suppressed — and delivered as one digest (t3team-actorReactionInput.ts)
 * that carries sender/subject/urgency per message, short bodies inlined, long
 * bodies as subject + t3team_read_message pointer.
 *
 * Drains are engagement-aware: the baseline coalescing window applies always,
 * and while the USER is actively typing in the thread's composer (the
 * per-thread composing heartbeat — see t3team-threadEngagement.ts) the drain
 * backs off, re-checking every baseline window until the typing signal
 * lapses. There is deliberately NO hard cap: a genuine typing signal is
 * self-clearing, so a pending digest can never be starved. `urgent`
 * deliveries keep the ONLY interrupt path: a zero window that claims
 * immediately, unchanged.
 *
 * The standing inter-agent protocol is appended to a thread's FIRST digest
 * since process start (mailbox isBriefed/markBriefed), not repeated per
 * message.
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
import { T3TeamActorMailbox } from "./t3team-actorMailbox.ts";
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
import { T3TeamThreadEngagement } from "./t3team-threadEngagement.ts";

export const T3TeamActorMessageReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const mailbox = yield* T3TeamActorMailbox;
    const engagement = yield* T3TeamThreadEngagement;
    const debounceMs = resolveActorMessageDebounceMs();
    const batchMax = resolveActorMessageBatchMax();
    // Restart-held set (GHE #155): captured from rehydrate below; declared
    // first so surfaceHoldSummary's closure binds it without a use-before-
    // declaration. Mutable: a thread is consumed (deleted) the first time its
    // hold is surfaced, so a later clean settle drains normally instead of
    // re-surfacing a summary (e.g. repeatedly listing a still-stopped child).
    let heldAtRehydrate: Set<string> = new Set();

    // Idle-aware wake policy: a per-thread mirror of the URGENT ids currently
    // pending in the mailbox. An urgent entry makes the next drain claim with
    // a zero window ("wake now"); claimed ids are forgotten at claim time and
    // re-noted on requeue (onRequeueUrgent), so a failed dispatch cannot
    // silently downgrade an urgent delivery to the idle window.
    const urgentPending = new Map<string, Set<string>>();
    const noteUrgentDelivery = (threadId: string, messageId: string) => {
      const ids = urgentPending.get(threadId) ?? new Set<string>();
      ids.add(messageId);
      urgentPending.set(threadId, ids);
    };
    const forgetClaimedUrgent = (
      threadId: string,
      batch: ReadonlyArray<{ readonly messageId: string }>,
    ) => {
      const ids = urgentPending.get(threadId);
      if (ids === undefined) return;
      for (const entry of batch) ids.delete(entry.messageId);
      if (ids.size === 0) urgentPending.delete(threadId);
    };
    const hasUrgentPending = (threadId: string) =>
      (urgentPending.get(threadId)?.size ?? 0) > 0;

    const loadThread = (threadId: string) =>
      query.getThreadDetailById(ThreadId.make(threadId)).pipe(
        Effect.orElseSucceed(() => Option.none()),
        Effect.map(Option.getOrUndefined),
      );

    // Claim-and-dispatch: only when the thread is neither reacting nor
    // otherwise running does a queued batch become a digest turn. The drain
    // is FORKED (a domain-event must never block the stream on the window)
    // and coalescing: it waits the baseline window — re-checking, while the
    // user is engaged, up to the hard cap — then claims the whole pending
    // batch so a burst of deliveries coalesces into ONE turn. The atomic
    // claim plus the `reacting` flag keep per-thread serialization:
    // concurrent drains for the same thread race to the claim, and only the
    // first wins a non-empty batch.
    const tryDrain = (threadId: string) =>
      Effect.gen(function* () {
        if (yield* mailbox.isReacting(threadId)) {
          return;
        }
        const thread = yield* loadThread(threadId);
        if (!thread || isThreadBusy(thread)) {
          return;
        }
        // Coalescing window. Urgent: zero window, claim now (the only
        // interrupt path — never gated by engagement). Everything else:
        // baseline window; deliveries enqueued while we wait join the batch.
        // While the user is actively TYPING in this thread's composer the
        // drain backs off — re-check engagement every baseline window and
        // keep waiting until the typing signal lapses. No cap: the signal is
        // self-clearing (the heartbeat stops when the user stops typing), so
        // a pending digest can never be starved.
        if (!hasUrgentPending(threadId) && debounceMs > 0) {
          for (;;) {
            yield* Effect.sleep(Duration.millis(debounceMs));
            // Re-check after the window: a user turn may have started while
            // we waited. If so, abort — the turn-settle drain picks up.
            const settled = yield* loadThread(threadId);
            if (!settled || isThreadBusy(settled)) {
              return;
            }
            if (!(yield* engagement.isEngaged(threadId))) {
              break;
            }
          }
        }
        const batch = yield* mailbox.takeNextForDispatch(threadId, batchMax);
        forgetClaimedUrgent(threadId, batch);
        if (batch.length === 0) {
          return;
        }
        // Once-per-session standing instruction: append to the FIRST digest
        // this thread receives since process start; mark only when the turn
        // actually dispatched (a failed/requeued batch keeps its briefing).
        const includeStanding = !(yield* mailbox.isBriefed(threadId));
        const dispatched = yield* startActorReaction({
          engine,
          mailbox,
          threadId,
          loadThread,
          entries: batch,
          includeStandingInstruction: includeStanding,
          // Re-note claimed-then-requeued urgent entries: forgetClaimedUrgent
          // already ran at claim, so a failed dispatch must not silently
          // downgrade them to the idle window.
          onRequeueUrgent: (requeued) => {
            for (const entry of requeued) {
              if (entry.urgency === "urgent") noteUrgentDelivery(threadId, entry.messageId);
            }
          },
        });
        if (dispatched && includeStanding) {
          yield* mailbox.markBriefed(threadId);
        }
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
        const includeStanding = !(yield* mailbox.isBriefed(threadId));
        const dispatched = yield* startActorRestartHoldSummary({
          engine,
          mailbox,
          threadId,
          loadThread,
          entries: batch,
          interruptedChildren: interrupted,
          includeStandingInstruction: includeStanding,
          onRequeueUrgent: (requeued) => {
            for (const entry of requeued) {
              if (entry.urgency === "urgent") noteUrgentDelivery(threadId, entry.messageId);
            }
          },
        });
        if (dispatched && includeStanding) {
          yield* mailbox.markBriefed(threadId);
        }
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
      noteUrgentDelivery,
    });

    yield* Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely));
    heldAtRehydrate = yield* rehydrateActorMailbox({
      engine,
      mailbox,
      hopCap: T3TEAM_ACTOR_MESSAGE_HOP_CAP,
    });
  }),
);
