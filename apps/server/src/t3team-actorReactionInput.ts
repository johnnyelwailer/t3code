import type { OrchestrationEvent } from "@t3tools/contracts";

import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

/**
 * Inter-agent delivery truncation: a delivered body longer than this many
 * characters reaches the recipient as a short preview plus a marker carrying
 * the message id; the full body stays persisted on the actor-role message and
 * is retrievable with `t3team_read_message`. Distribution-tunable via the
 * `T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS` environment variable.
 */
export const T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS = 1500;
/** Preview length kept at the head of a truncated inter-agent body. */
export const T3TEAM_ACTOR_MESSAGE_DELIVERY_PREVIEW_CHARS = 500;
const T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS_ENV = "T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS";

/** Resolve the delivery cap, honoring the distribution-tunable env override. */
export function resolveActorMessageDeliveryMaxChars(): number {
  const raw = process.env[T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS;
}

/**
 * Deliver only a truncated preview of an over-long inter-agent body: the first
 * ~500 characters plus a marker line naming the message id so the recipient
 * can retrieve the full text with `t3team_read_message`. Bodies at or under
 * the cap pass through verbatim — no behavior change for short messages.
 */
export function truncateActorMessageForDelivery(
  text: string,
  messageId: string,
  maxChars: number = resolveActorMessageDeliveryMaxChars(),
): string {
  if (text.length <= maxChars) {
    return text;
  }
  const preview = text.slice(0, T3TEAM_ACTOR_MESSAGE_DELIVERY_PREVIEW_CHARS);
  return (
    `${preview}\n…[truncated — ${text.length} chars total; message id ${messageId} — ` +
    "call t3team_read_message with this message id to read the full text]"
  );
}

export const buildActorReactionInput = (entry: T3TeamActorMailboxEntry): string =>
  [
    `[Message from peer agent «${entry.fromTitle}» · thread ${entry.fromThreadId} · ` +
      `urgency ${entry.urgency}]`,
    "",
    truncateActorMessageForDelivery(entry.text, entry.messageId),
    "",
    "[This message is from another agent actor, not a human user. You are an autonomous " +
      "actor: decide whether and how to act on it, then continue your own work. To reply to " +
      `the sender, use your send-message tool addressed to thread ${entry.fromThreadId}. ` +
      "Keep inter-agent messages short (telegram style: state, decision, request). Put " +
      "details in an attached markdown report or a file the recipient can read on demand; " +
      "long bodies are truncated on delivery and the recipient retrieves the full text " +
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
 * section per delivery, each body truncated with its own message id.
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
      truncateActorMessageForDelivery(entry.text, entry.messageId),
      "",
    ]),
    "[These messages are from other agent actors, not a human user. You are an autonomous " +
      "actor: decide whether and how to act on them, then continue your own work. To reply " +
      "to a sender, use your send-message tool addressed to that sender's thread. Keep " +
      "inter-agent messages short (telegram style: state, decision, request). Put details " +
      "in an attached markdown report or a file the recipient can read on demand; long " +
      "bodies are truncated on delivery and the recipient retrieves the full text with " +
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
        buildActorReactionInput(entry) === event.payload.text,
    );
    if (index >= 0) pending.splice(index, 1);
  }
  return pending;
}
