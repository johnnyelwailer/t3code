/**
 * Reactor that turns a delivered inter-agent ("actor") message into a reaction
 * turn on the receiving thread.
 *
 * F1 — a Pi agent only ever sees the `sendTurn` input string (it replays its own
 * in-memory history, never the host projection), so a message-upsert of any role
 * is invisible to it. An actor message reaches the agent ONLY as a real turn
 * whose input embeds the sender framing: this reactor dispatches a normal
 * `thread.turn.start` carrying that framed input, reusing the whole turn
 * machinery (session ensure, model selection, provider `sendTurn`, checkpoints)
 * through the engine seam. The turn message is `visibleToUser: false` so the UI
 * hides the raw framing and shows the actor card instead.
 *
 * F2 — the shared decider admission guard plus this mailbox serialize turns.
 * Delivered messages enqueue; turn-settle events clear and drain the mailbox.
 * Phase 1 is `normal` urgency only; `urgent` interrupt + per-pair rate cap are
 * Phase 2 (the seams are already in place).
 *
 * Coalescing — a burst of inter-agent deliveries is NOT one reaction turn per
 * message. Every drain first waits a short, configurable debounce window, then
 * claims the thread's WHOLE pending batch and dispatches it as a single
 * reaction turn (one framed input listing every delivery). A delivery that
 * lands after the claim triggers its own drain and flushes the next batch.
 * The drain is forked (never blocks the domain-event stream) and the
 * per-thread `reacting` flag + hop cap still bound everything: exactly one
 * reaction turn per thread in flight, no run-away chains.
 *
 * @module t3team-actorMessageReactor
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { makeT3TeamActorMailbox } from "./t3team-actorMailbox.ts";
import { rehydrateActorMailbox } from "./t3team-actorMailboxRehydrate.ts";
import { startActorReaction } from "./t3team-actorMessageReaction.ts";
import {
  clearSuppressionForThreadTree,
  isRealUserMessage,
} from "./t3team-actorMessageSuppression.ts";

/**
 * Maximum number of auto-reaction hops in a single actor-message chain. A
 * human-initiated message is hop 0; each agent that reacts and messages another
 * actor increments the hop. Past the cap the message is surfaced but not
 * reacted to, so a self-sustaining loop cannot run away.
 */
export const T3TEAM_ACTOR_MESSAGE_HOP_CAP = 6;

/**
 * Inter-agent coalescing: how long a drain waits before claiming the pending
 * batch, so deliveries arriving within the window group into ONE reaction
 * turn. Distribution-tunable via `T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS` (0 disables
 * the window — claims happen immediately, still batched).
 */
export const T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS = 2000;
const T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS_ENV = "T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS";

/** Resolve the coalescing debounce window, honoring the env override. */
export function resolveActorMessageDebounceMs(): number {
  const raw = process.env[T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS;
}

/**
 * Safety valve on a coalesced batch: at most this many deliveries per reaction
 * turn (each body is already summarized on delivery). Anything past the cap
 * stays queued and flushes as the next batch after this turn settles.
 * Distribution-tunable via `T3TEAM_ACTOR_MESSAGE_BATCH_MAX`.
 */
export const T3TEAM_ACTOR_MESSAGE_BATCH_MAX = 10;
const T3TEAM_ACTOR_MESSAGE_BATCH_MAX_ENV = "T3TEAM_ACTOR_MESSAGE_BATCH_MAX";

/** Resolve the per-turn batch cap, honoring the env override. */
export function resolveActorMessageBatchMax(): number {
  const raw = process.env[T3TEAM_ACTOR_MESSAGE_BATCH_MAX_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return T3TEAM_ACTOR_MESSAGE_BATCH_MAX;
}

export const T3TeamActorMessageReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const mailbox = yield* makeT3TeamActorMailbox;
    const debounceMs = resolveActorMessageDebounceMs();
    const batchMax = resolveActorMessageBatchMax();

    const loadThread = (threadId: string) =>
      query.getThreadDetailById(ThreadId.make(threadId)).pipe(
        Effect.orElseSucceed(() => Option.none()),
        Effect.map(Option.getOrUndefined),
      );

    const isThreadBusy = (thread: {
      readonly session: { readonly status: string } | null;
      readonly latestTurn: { readonly state: string } | null;
    }): boolean => {
      const status = thread.session?.status;
      if (status === "running" || status === "starting") {
        return true;
      }
      return thread.latestTurn?.state === "running";
    };

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

    const onDelivered = (
      payload: Extract<OrchestrationEvent, { type: "thread.actor-message-delivered" }>["payload"],
    ) =>
      Effect.gen(function* () {
        if (payload.hopCount > T3TEAM_ACTOR_MESSAGE_HOP_CAP) {
          yield* Effect.logInfo("actor message exceeded hop cap; surfaced without reaction", {
            threadId: payload.threadId,
            fromThreadId: payload.fromThreadId,
            hopCount: payload.hopCount,
          });
          return;
        }
        yield* mailbox.enqueue(payload.threadId, {
          messageId: payload.messageId,
          fromThreadId: payload.fromThreadId,
          fromTitle: payload.fromTitle,
          fromProjectId: payload.fromProjectId,
          text: payload.text,
          ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
          urgency: payload.urgency,
          hopCount: payload.hopCount,
          rootThreadId: payload.rootThreadId,
          createdAt: payload.createdAt,
          dispatchAttempts: 0,
        });
        yield* tryDrain(payload.threadId);
      });

    const handleEvent = (
      event: OrchestrationEvent,
    ): Effect.Effect<void, never, SqlClient.SqlClient> => {
      switch (event.type) {
        case "thread.actor-message-delivered":
          return onDelivered(event.payload);
        case "thread.session-set": {
          const status = event.payload.session.status;
          const turnEnded = status !== "running" && status !== "starting";
          return turnEnded
            ? mailbox
                .clearReacting(event.payload.threadId)
                .pipe(Effect.andThen(tryDrain(event.payload.threadId)))
            : Effect.void;
        }
        case "thread.turn-diff-completed":
          return tryDrain(event.payload.threadId);
        // A person clicked "Stop generation" — suppress auto-dispatch so a
        // following actor message can't re-open the turn they just stopped.
        // NOTE (accepted race): a reaction turn already in flight when the
        // suppress lands still completes and its own settle can trigger one
        // more drain before the flag takes effect on the NEXT delivery. That
        // is at most one extra turn, and the mailbox's serialization still
        // converges — it does not resume the ping-pong.
        case "thread.turn-interrupt-requested":
          return event.payload.byUser === true
            ? mailbox.suppress(event.payload.threadId)
            : Effect.void;
        // The user re-engaging (not an actor reaction/system message wearing
        // the "user" role) lifts suppression and drains anything queued.
        case "thread.message-sent":
          return isRealUserMessage(event.payload)
            ? clearSuppressionForThreadTree({
                mailbox,
                tryDrain,
                threadId: event.payload.threadId,
              })
            : Effect.void;
        default:
          return Effect.void;
      }
    };

    const handleSafely = (event: OrchestrationEvent) =>
      handleEvent(event).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
          return Effect.logWarning("t3team actor-message reactor failed to process event", {
            eventType: event.type,
            cause: Cause.pretty(cause),
          });
        }),
      );

    yield* Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely));
    yield* rehydrateActorMailbox({
      engine,
      mailbox,
      hopCap: T3TEAM_ACTOR_MESSAGE_HOP_CAP,
      tryDrain,
    });
  }),
);
