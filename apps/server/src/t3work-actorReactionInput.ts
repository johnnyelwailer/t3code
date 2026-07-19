import type { OrchestrationEvent } from "@t3tools/contracts";

import type { T3workActorMailboxEntry } from "./t3work-actorMailbox.ts";

export const buildActorReactionInput = (entry: T3workActorMailboxEntry): string =>
  [
    `[Message from peer agent «${entry.fromTitle}» · thread ${entry.fromThreadId} · ` +
      `urgency ${entry.urgency}]`,
    "",
    entry.text,
    "",
    "[This message is from another agent actor, not a human user. You are an autonomous " +
      "actor: decide whether and how to act on it, then continue your own work. To reply to " +
      `the sender, use your send-message tool addressed to thread ${entry.fromThreadId}.]`,
  ].join("\n");

const fromDelivery = (
  payload: Extract<OrchestrationEvent, { type: "thread.actor-message-delivered" }>["payload"],
): T3workActorMailboxEntry => ({
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

/** Replay deliveries and their admitted hidden inputs, leaving only pending work. */
export function collectPendingActorDeliveries(
  events: ReadonlyArray<OrchestrationEvent>,
  hopCap: number,
): ReadonlyArray<{ readonly threadId: string; readonly entry: T3workActorMailboxEntry }> {
  const pending: Array<{ threadId: string; entry: T3workActorMailboxEntry }> = [];
  for (const event of events) {
    if (event.type === "thread.actor-message-delivered") {
      if (event.payload.hopCount <= hopCap) {
        pending.push({ threadId: event.payload.threadId, entry: fromDelivery(event.payload) });
      }
      continue;
    }
    if (event.type !== "thread.message-sent" || event.payload.role !== "user") continue;
    const actor = event.payload.t3workExt?.actor;
    if (!actor || event.payload.t3workExt?.visibleToUser !== false) continue;
    const index = pending.findIndex(
      ({ threadId, entry }) =>
        threadId === event.payload.threadId &&
        entry.fromThreadId === actor.senderThreadId &&
        entry.hopCount === actor.hopCount &&
        entry.rootThreadId === actor.rootThreadId &&
        buildActorReactionInput(entry) === event.payload.text,
    );
    if (index >= 0) pending.splice(index, 1);
  }
  return pending;
}
