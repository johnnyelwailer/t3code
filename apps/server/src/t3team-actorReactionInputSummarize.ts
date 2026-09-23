/**
 * Inter-agent delivery inline/pointer policy (split out of
 * `t3team-actorReactionInput.ts`).
 *
 * ONE rule for every delivery: bodies at or under the inline cap are inlined
 * verbatim into the digest; bodies above it reach the recipient as the SUBJECT
 * (sender-provided summary or an auto-generated one) plus a marker carrying
 * the message id. The full body stays persisted on the actor-role message and
 * is retrievable with `t3team_read_message`.
 *
 * The cap is ~1 KB: the measured recipient threads dereferenced pointers ~1:1
 * (58 `t3team_read_message` calls against 48 deliveries), and each
 * dereference costs a tool turn plus a full context re-prefill — more than
 * the bytes the body would have cost inlined. With the per-turn batch cap of
 * 10, the worst-case digest stays around 10–15 KB.
 */

/**
 * Bodies at or under this many characters are inlined into the inter-agent
 * digest instead of arriving as a subject + t3team_read_message pointer.
 * Distribution-tunable via `T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS`.
 */
export const T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS = 1000;
/**
 * Summary length budget: an over-long body is represented by at most this many
 * characters of subject (sender-provided or auto-generated), never by a raw
 * head-of-body cut.
 */
export const T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS = 300;
const T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS_ENV = "T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS";

/** Resolve the inline cap, honoring the distribution-tunable env override. */
export function resolveActorMessageInlineMaxChars(): number {
  const raw = process.env[T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS;
}

/**
 * Cap a sender-provided subject at the summary budget, cutting at the last
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
 * Auto-derive a SUBJECT from an inter-agent body: the first ~300 characters,
 * cut at the last sentence boundary (then newline, then word boundary) inside
 * that window — never a raw mid-word cut. Deterministic and dependency-free.
 *
 * Display-only: this derivation must never gate delivery, ordering, urgency
 * or batching — it exists to title the card and the digest one-liner.
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
 * Inline-or-pointer policy for a delivered body: at or under the inline cap
 * the body passes through verbatim; above it the SUBJECT (sender-provided or
 * auto-derived) plus a marker line naming the message id so the recipient can
 * retrieve the full text with `t3team_read_message`.
 */
export function summarizeActorMessageForDelivery(
  text: string,
  messageId: string,
  summary?: string,
  maxChars: number = resolveActorMessageInlineMaxChars(),
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
    `${head}\n…[body NOT loaded — ${text.length} chars total; message id ${messageId} — ` +
    "call t3team_read_message with this message id to read the full text]"
  );
}

// --- LEGACY (pre-overhaul) delivery framing — rehydrate matching ONLY -------
//
// Admitted reaction inputs persisted BEFORE the digest-framing overhaul used
// THIS policy: a 1500-char inline cap (env `T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS`)
// and the `…[summarized —` marker. Restart rehydrate replays the full event
// log, so the legacy full-body base must reproduce these EXACT outputs —
// re-deriving them with the current cap/marker would fail to prefix-match
// old admitted inputs and re-deliver (double-react) every over-1000-char
// held message after an upgrade. NEVER used for NEW turns.

/** LEGACY inline cap: bodies at or under this were inlined verbatim. */
export const LEGACY_T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS = 1500;
const LEGACY_T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS_ENV = "T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS";

/**
 * Resolve the LEGACY inline cap exactly as the pre-overhaul code did
 * (same env var, same default) so matching stays faithful for distributions
 * that tuned the old cap.
 */
export function resolveLegacyActorMessageDeliveryMaxChars(): number {
  const raw = process.env[LEGACY_T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return LEGACY_T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS;
}

/**
 * LEGACY inline-or-pointer policy — byte-faithful to the pre-overhaul
 * `summarizeActorMessageForDelivery` (1500-char cap, `…[summarized —` marker).
 * Rehydrate matching only; new turns use {@link summarizeActorMessageForDelivery}.
 */
export function summarizeActorMessageForDeliveryLegacy(
  text: string,
  messageId: string,
  summary?: string,
  maxChars: number = resolveLegacyActorMessageDeliveryMaxChars(),
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
