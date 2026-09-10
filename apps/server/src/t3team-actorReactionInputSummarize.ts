/**
 * Inter-agent delivery summarization (split out of
 * `t3team-actorReactionInput.ts`).
 */

/**
 * Inter-agent delivery summarization: a delivered body longer than this many
 * characters reaches the recipient as a SHORT SUMMARY plus a marker carrying
 * the message id; the full body stays persisted on the actor-role message and
 * is retrievable with `read_message`. Distribution-tunable via the
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
 * `read_message`. Bodies at or under the cap pass through verbatim —
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
    "call read_message with this message id to read the full text]"
  );
}
