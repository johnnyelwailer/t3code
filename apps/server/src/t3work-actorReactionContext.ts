import type { OrchestrationMessage } from "@t3tools/contracts";

export interface T3workActorReplyContext {
  readonly hopCount: number;
  readonly rootThreadId: string;
}

/** Derive ancestry from the current turn input, never from unrelated actor cards. */
export function deriveActorReplyContext(
  messages: ReadonlyArray<OrchestrationMessage>,
  senderThreadId: string,
): T3workActorReplyContext {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;

    const actor = message.t3workExt?.actor;
    return actor
      ? { hopCount: actor.hopCount + 1, rootThreadId: actor.rootThreadId }
      : { hopCount: 0, rootThreadId: senderThreadId };
  }

  return { hopCount: 0, rootThreadId: senderThreadId };
}
