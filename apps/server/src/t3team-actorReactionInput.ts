import type { OrchestrationEvent } from "@t3tools/contracts";

import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

import {
  summarizeActorMessageForDelivery,
} from "./t3team-actorReactionInputSummarize.ts";

export const buildActorReactionInput = (entry: T3TeamActorMailboxEntry): string =>
  [
    `[Message from peer agent «${entry.fromTitle}» · thread ${entry.fromThreadId} · ` +
      `urgency ${entry.urgency}]`,
    "",
    summarizeActorMessageForDelivery(entry.text, entry.messageId, entry.summary),
    "",
    "[This message is from another agent actor, not a human user. You are an autonomous " +
      "actor: decide whether and how to act on it, then continue your own work. To reply to " +
      `the sender, use your send-message tool addressed to thread ${entry.fromThreadId}. ` +
      "Keep inter-agent messages short (telegram style: state, decision, request). Put " +
      "details in an attached markdown report or a file the recipient can read on demand; " +
      "long bodies are summarized on delivery and the recipient retrieves the full text " +
      "with t3team_read_message.]",
  ].join("\n");

/**
 * Reaction input for a CLAIMED BATCH of deliveries (inter-agent coalescing):
 * one reaction turn per batch instead of one turn per message.
 *
 * A single-entry batch formats EXACTLY like {@link buildActorReactionInput} —
 * single-message delivery semantics are unchanged, and the restart-rehydrate
 * matching (which compares admitted inputs against the single-entry format)
 * keeps working. Multiple entries get a batch header and one sender-framed
 * section per delivery, each body summarized with its own message id.
 */
export const buildActorReactionBatchInput = (
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
): string => {
  const [single] = entries;
  if (entries.length === 1 && single !== undefined) {
    return buildActorReactionInput(single);
  }
  return [
    `[${entries.length} messages from peer agents]`,
    "",
    ...entries.flatMap((entry) => [
      `[Message from peer agent «${entry.fromTitle}» · thread ${entry.fromThreadId} · ` +
        `urgency ${entry.urgency}]`,
      "",
      summarizeActorMessageForDelivery(entry.text, entry.messageId, entry.summary),
      "",
    ]),
    "[These messages are from other agent actors, not a human user. You are an autonomous " +
      "actor: decide whether and how to act on them, then continue your own work. To reply " +
      "to a sender, use your send-message tool addressed to that sender's thread. Keep " +
      "inter-agent messages short (telegram style: state, decision, request). Put details " +
      "in an attached markdown report or a file the recipient can read on demand; long " +
      "bodies are summarized on delivery and the recipient retrieves the full text with " +
      "t3team_read_message.]",
  ].join("\n");
};

const fromDelivery = (
  payload: Extract<OrchestrationEvent, { type: "thread.actor-message-delivered" }>["payload"],
): T3TeamActorMailboxEntry => ({
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

/** Replay deliveries and their admitted hidden inputs, leaving only pending work. */
export function collectPendingActorDeliveries(
  events: ReadonlyArray<OrchestrationEvent>,
  hopCap: number,
): ReadonlyArray<{ readonly threadId: string; readonly entry: T3TeamActorMailboxEntry }> {
  const pending: Array<{ threadId: string; entry: T3TeamActorMailboxEntry }> = [];
  for (const event of events) {
    if (event.type === "thread.actor-message-delivered") {
      if (event.payload.hopCount <= hopCap) {
        pending.push({ threadId: event.payload.threadId, entry: fromDelivery(event.payload) });
      }
      continue;
    }
    if (event.type !== "thread.message-sent" || event.payload.role !== "user") continue;
    const actor = event.payload.t3teamExt?.actor;
    if (!actor || event.payload.t3teamExt?.visibleToUser !== false) continue;
    // A batched reaction turn coalesced several deliveries into ONE admitted
    // input: its `actor.messageIds` names the whole batch, so every delivery
    // it carries is already reacted — remove them all.
    if (actor.messageIds !== undefined) {
      const reactedIds = new Set(actor.messageIds);
      for (let i = pending.length - 1; i >= 0; i -= 1) {
        const candidate = pending[i];
        if (
          candidate !== undefined &&
          candidate.threadId === event.payload.threadId &&
          reactedIds.has(candidate.entry.messageId)
        ) {
          pending.splice(i, 1);
        }
      }
      continue;
    }
    const index = pending.findIndex(
      ({ threadId, entry }) =>
        threadId === event.payload.threadId &&
        entry.fromThreadId === actor.senderThreadId &&
        entry.hopCount === actor.hopCount &&
        entry.rootThreadId === actor.rootThreadId &&
        // GHE #156: the admitted input may carry the user-return instruction as a
        // SUFFIX after the stable framing, so match the base framing as a PREFIX.
        event.payload.text.startsWith(buildActorReactionInput(entry)),
    );
    if (index >= 0) pending.splice(index, 1);
  }
  return pending;
}
