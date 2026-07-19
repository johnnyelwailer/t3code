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
 * @module t3work-actorMessageReactor
 */
import { CommandId, MessageId, type OrchestrationEvent, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { makeT3workActorMailbox, type T3workActorMailboxEntry } from "./t3work-actorMailbox.ts";
import { rehydrateActorMailbox } from "./t3work-actorMailboxRehydrate.ts";
import { buildActorReactionInput } from "./t3work-actorReactionInput.ts";
import { t3workRandomUUID } from "./t3work-random.ts";

/**
 * Maximum number of auto-reaction hops in a single actor-message chain. A
 * human-initiated message is hop 0; each agent that reacts and messages another
 * actor increments the hop. Past the cap the message is surfaced but not
 * reacted to, so a self-sustaining loop cannot run away.
 */
export const T3WORK_ACTOR_MESSAGE_HOP_CAP = 6;

export const T3workActorMessageReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const mailbox = yield* makeT3workActorMailbox;

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

    const startReaction = (threadId: string, entry: T3workActorMailboxEntry) =>
      Effect.gen(function* () {
        const thread = yield* loadThread(threadId);
        if (!thread) {
          // Thread vanished between claim and dispatch; release the flag so a
          // later delivery is not stuck behind a phantom reaction.
          yield* mailbox.clearReacting(threadId);
          return;
        }
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        yield* engine
          .dispatch({
            type: "thread.turn.start",
            commandId: CommandId.make(`server:t3work:actor-react:${t3workRandomUUID()}`),
            threadId: thread.id,
            message: {
              messageId: MessageId.make(t3workRandomUUID()),
              role: "user",
              text: buildActorReactionInput(entry),
              attachments: [],
              t3workExt: {
                visibleToUser: false,
                actor: {
                  senderThreadId: entry.fromThreadId,
                  urgency: entry.urgency,
                  hopCount: entry.hopCount,
                  rootThreadId: entry.rootThreadId,
                },
              },
            },
            modelSelection: thread.modelSelection,
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
            createdAt,
          })
          .pipe(
            Effect.catch((error) =>
              mailbox.requeueFailed(threadId, entry).pipe(
                Effect.flatMap((willRetry) =>
                  Effect.logWarning("actor-message reaction turn failed to start", {
                    threadId,
                    fromThreadId: entry.fromThreadId,
                    dispatchAttempts: entry.dispatchAttempts + 1,
                    willRetry,
                    error,
                  }),
                ),
              ),
            ),
          );
      });

    // Claim-and-dispatch: only when the thread is neither reacting nor otherwise
    // running does a queued message become a reaction turn. Stream events are
    // processed sequentially, so this never interleaves with itself for one
    // thread; the reacting flag guards the projection-lag window across events,
    // and the projection re-check guards against a stale idle signal.
    const tryDrain = (threadId: string) =>
      Effect.gen(function* () {
        if (yield* mailbox.isReacting(threadId)) {
          return;
        }
        const thread = yield* loadThread(threadId);
        if (!thread || isThreadBusy(thread)) {
          return;
        }
        const entry = yield* mailbox.takeNextForDispatch(threadId);
        if (!entry) {
          return;
        }
        yield* startReaction(threadId, entry);
      });

    const onDelivered = (
      payload: Extract<OrchestrationEvent, { type: "thread.actor-message-delivered" }>["payload"],
    ) =>
      Effect.gen(function* () {
        if (payload.hopCount > T3WORK_ACTOR_MESSAGE_HOP_CAP) {
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
          urgency: payload.urgency,
          hopCount: payload.hopCount,
          rootThreadId: payload.rootThreadId,
          createdAt: payload.createdAt,
          dispatchAttempts: 0,
        });
        yield* tryDrain(payload.threadId);
      });

    const handleEvent = (event: OrchestrationEvent): Effect.Effect<void> => {
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
        default:
          return Effect.void;
      }
    };

    const handleSafely = (event: OrchestrationEvent) =>
      handleEvent(event).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
          return Effect.logWarning("t3work actor-message reactor failed to process event", {
            eventType: event.type,
            cause: Cause.pretty(cause),
          });
        }),
      );

    yield* Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely));
    yield* rehydrateActorMailbox({
      engine,
      mailbox,
      hopCap: T3WORK_ACTOR_MESSAGE_HOP_CAP,
      tryDrain,
    });
  }),
);
