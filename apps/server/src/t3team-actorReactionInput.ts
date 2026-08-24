import type { OrchestrationEvent } from "@t3tools/contracts";

import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

/**
 * Inter-agent delivery summarization: a delivered body longer than this many
 * characters reaches the recipient as a SHORT SUMMARY plus a marker carrying
 * the message id; the full body stays persisted on the actor-role message and
 * is retrievable with `t3team_read_message`. Distribution-tunable via the
 * `T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS` environment variable.
 */
export const T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS = 1500;
/**
 * Summary length budget: a delivered over-long body is represented by at most
 * this many characters of summary (sender-provided or auto-generated), never
 * by a raw head-of-body cut.
 */
export const T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS = 300;
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
 * Cap a sender-provided summary at the summary budget, cutting at the last
 * word boundary so a long summary never ends mid-word.
 */
export function capActorMessageSummary(
  summary: string,
  maxChars: number = T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS,
): string {
  const trimmed = summary.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const window = trimmed.slice(0, maxChars);
  const space = window.lastIndexOf(" ");
  return space > 0 ? `${window.slice(0, space)}…` : `${window}…`;
}

/**
 * Auto-summarize an inter-agent body: the first ~300 characters, cut at the
 * last sentence boundary (then newline, then word boundary) inside that
 * window — never a raw mid-word cut. Deterministic and dependency-free; used
 * when the sender did not provide a summary.
 */
export function autoSummarizeActorMessage(
  text: string,
  maxChars: number = T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS,
): string {
  if (text.length <= maxChars) return text;
  const window = text.slice(0, maxChars);
  // Never cut closer than half the window to the start, so a long first
  // sentence cannot produce a stub summary.
  const floor = Math.floor(maxChars / 2);
  let cut = -1;
  for (const marker of [". ", "! ", "? ", ".\n", "!\n", "?\n"]) {
    const index = window.lastIndexOf(marker);
    if (index > cut) cut = index;
  }
  if (cut >= floor) {
    // Drop the trailing punctuation — the ellipsis replaces it.
    return `${window
      .slice(0, cut + 1)
      .trimEnd()
      .replace(/[.!?]$/, "")}…`;
  }
  cut = window.lastIndexOf("\n");
  if (cut >= floor) return `${window.slice(0, cut).trimEnd()}…`;
  cut = window.lastIndexOf(" ");
  if (cut > 0) return `${window.slice(0, cut)}…`;
  return `${window}…`;
}

/**
 * Deliver a SHORT SUMMARY of an over-long inter-agent body instead of a raw
 * head-of-body cut: the sender-provided summary when present (capped at the
 * summary budget), otherwise an auto-generated one, plus a marker line naming
 * the message id so the recipient can retrieve the full text with
 * `t3team_read_message`. Bodies at or under the cap pass through verbatim —
 * no behavior change for short messages.
 */
export function summarizeActorMessageForDelivery(
  text: string,
  messageId: string,
  summary?: string,
  maxChars: number = resolveActorMessageDeliveryMaxChars(),
): string {
  if (text.length <= maxChars) {
    return text;
  }
  const senderSummary = summary?.trim();
  const head =
    senderSummary !== undefined && senderSummary !== ""
      ? capActorMessageSummary(senderSummary)
      : autoSummarizeActorMessage(text);
  return (
    `${head}\n…[summarized — ${text.length} chars total; message id ${messageId} — ` +
    "call t3team_read_message with this message id to read the full text]"
  );
}

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
        buildActorReactionInput(entry) === event.payload.text,
    );
    if (index >= 0) pending.splice(index, 1);
  }
  return pending;
}
