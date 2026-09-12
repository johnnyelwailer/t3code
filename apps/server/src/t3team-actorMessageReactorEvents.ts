/**
 * Domain-event handling for the actor-message reactor (split out of
 * `t3team-actorMessageReactor.ts`): delivery enqueue + the event switch that
 * routes settles, interrupts, and real user messages into drains.
 */

import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { T3TeamActorMailboxShape } from "./t3team-actorMailbox.ts";
import {
  clearSuppressionForThreadTree,
  isRealUserMessage,
} from "./t3team-actorMessageSuppression.ts";
import { T3TEAM_ACTOR_MESSAGE_HOP_CAP } from "./t3team-actorMessageReactorLimits.ts";

export function createActorMessageEventHandler(input: {
  readonly mailbox: T3TeamActorMailboxShape;
  readonly tryDrain: (threadId: string) => Effect.Effect<void, never, SqlClient.SqlClient>;
  readonly surfaceHoldSummary: (
    threadId: string,
  ) => Effect.Effect<void, never, SqlClient.SqlClient>;
  /**
   * Idle-aware wake policy: an `urgent` delivery notes its id in the
   * per-thread urgent-pending mirror so the next drain claims it with a
   * zero window instead of the idle debounce.
   */
  readonly noteUrgentDelivery: (threadId: string, messageId: string) => void;
}) {
  const { mailbox, tryDrain, surfaceHoldSummary, noteUrgentDelivery } = input;

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
      if (payload.urgency === "urgent") {
        noteUrgentDelivery(payload.threadId, payload.messageId);
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
        if (!turnEnded) {
          return Effect.void;
        }
        // A clean settle on a HELD thread is the user's "continue": surface
        // the held work as ONE summary turn. A stop/error settle keeps the
        // hold — the user stopped the turn or it failed; nothing
        // auto-surfaces (and a user stop must never re-open the turn).
        const onSettle = status === "idle" || status === "ready" ? surfaceHoldSummary : tryDrain;
        return mailbox
          .clearReacting(event.payload.threadId)
          .pipe(Effect.andThen(onSettle(event.payload.threadId)));
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
      // the "user" role) lifts suppression and drains anything queued. NOTE:
      // a sent user message does NOT mark the thread engaged — only the
      // per-thread composing heartbeat does (see t3team-threadEngagement).
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

  return { handleSafely };
}
