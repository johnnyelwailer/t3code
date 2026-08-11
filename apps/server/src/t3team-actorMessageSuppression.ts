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

export function isRealUserMessage(
  payload: Extract<OrchestrationEvent, { type: "thread.message-sent" }>["payload"],
): boolean {
  return (
    payload.role === "user" &&
    payload.t3teamExt?.actor === undefined &&
    payload.t3teamExt?.author === undefined
  );
}
