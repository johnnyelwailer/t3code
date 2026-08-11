/**
 * Whether a `thread.message-sent` event was written by a real, typed-by-a-human
 * message rather than fork automation wearing the `user` role.
 *
 * `t3teamExt.actor` marks an inter-agent reaction turn (see
 * t3team-actorMessageReactor.ts); `t3teamExt.author` marks every other
 * automated sender (system notices, workflow `askAgent` prompts — see
 * t3team-message-author.ts, whose own doc states the contract: "absence means
 * the user typed it"). Only a message with neither is the user re-engaging,
 * which is what should lift actor-message suppression on a stopped thread.
 *
 * @module t3team-actorMessageSuppression
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { T3TeamActorMailboxShape } from "./t3team-actorMailbox.ts";
import { loadT3TeamThreadDescendants } from "./t3team-threadStopCascade.ts";

export function isRealUserMessage(
  payload: Extract<OrchestrationEvent, { type: "thread.message-sent" }>["payload"],
): boolean {
  return (
    payload.role === "user" &&
    payload.t3teamExt?.actor === undefined &&
    payload.t3teamExt?.author === undefined
  );
}

/**
 * Rederive which threads should start suppressed on a fresh process (server
 * restart, new reactor instance) by replaying the event log: a thread is
 * suppressed when its most recent `byUser` `thread.turn-interrupt-requested`
 * is newer than its most recent real-user `thread.message-sent`. Without
 * this, a restart forgets the in-memory `suppressed` flag entirely and
 * `rehydrateActorMailbox`'s drain immediately resumes the exact ping-pong the
 * suppression exists to stop.
 */
export function collectSuppressedThreadsAtRehydrate(
  events: ReadonlyArray<OrchestrationEvent>,
): ReadonlySet<string> {
  const lastUserStopSequence = new Map<string, number>();
  const lastRealUserMessageSequence = new Map<string, number>();
  for (const event of events) {
    if (event.type === "thread.turn-interrupt-requested" && event.payload.byUser === true) {
      lastUserStopSequence.set(event.payload.threadId, event.sequence);
    } else if (event.type === "thread.message-sent" && isRealUserMessage(event.payload)) {
      lastRealUserMessageSequence.set(event.payload.threadId, event.sequence);
    }
  }
  const suppressed = new Set<string>();
  for (const [threadId, stopSequence] of lastUserStopSequence) {
    const messageSequence = lastRealUserMessageSequence.get(threadId) ?? -1;
    if (stopSequence > messageSequence) {
      suppressed.add(threadId);
    }
  }
  return suppressed;
}

/**
 * Lift suppression for `threadId` AND every descendant a cascade stop may
 * have suppressed (see t3team-threadStopCascadeReactor.ts) — a real user
 * message lands on the PARENT thread, not the child, so lifting only the
 * parent would leave a cascade-stopped child suppressed forever.
 */
export function clearSuppressionForThreadTree(input: {
  readonly mailbox: T3TeamActorMailboxShape;
  readonly tryDrain: (threadId: string) => Effect.Effect<void>;
  readonly threadId: string;
}): Effect.Effect<void, never, SqlClient.SqlClient> {
  return Effect.gen(function* () {
    yield* input.mailbox.clearSuppression(input.threadId);
    yield* input.tryDrain(input.threadId);
    const descendants = yield* loadT3TeamThreadDescendants(input.threadId);
    yield* Effect.forEach(
      descendants,
      (descendantId) =>
        input.mailbox
          .clearSuppression(descendantId)
          .pipe(Effect.andThen(input.tryDrain(descendantId))),
      { concurrency: 1 },
    );
  });
}
