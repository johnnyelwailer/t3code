/**
 * Burst-fold policy for automated (inter-agent) message batches (GHE #157).
 *
 * One real event can fan out into a burst of similar automated notices —
 * silence watches, abnormal stops, completion notices, workflow steps. When
 * enough of them land in one delivery, they are FOLDED into a single compact
 * list (a header naming the count, one short line per item, and a
 * t3team_read_message pointer) instead of one verbose block each.
 *
 * The fold is a DELIVERY-LEVEL concern, not a per-notifier one: it sits beside
 * the digest framing and the restart-hold summary, so EVERY automated source
 * inherits it just by passing through this one renderer — no notifier copies
 * the compact form. Two call sites: buildActorReactionDigestInput and
 * buildActorRestartHoldSummary.
 *
 * Invariants the fold relies on:
 *   - DEDUP runs FIRST (the server-side terminal-notify ledger, GHE #157 /
 *     #222), so the fold renders an already-deduplicated set — it never
 *     re-collapses repeats on its own.
 *   - URGENT entries BYPASS the fold: they keep their own full block so a
 *     hard blocker is never buried in a compact list.
 *   - HUMAN messages never fold. The actor mailbox is inter-agent-only
 *     (human turns go through the normal user path), so this is structural —
 *     the renderer only ever receives actor entries.
 *
 * @module t3team-actorBurstFold
 */
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import {
  autoSummarizeActorMessage,
  capActorMessageSummary,
} from "./t3team-actorReactionInputSummarize.ts";

/** A batch of strictly MORE than this many foldable (non-urgent) entries is a burst. */
export const ACTOR_BURST_FOLD_THRESHOLD = 4;

/** Subject budget for a folded item line — far shorter than the delivery cap. */
export const ACTOR_BURST_ITEM_SUBJECT_MAX_CHARS = 80;

/**
 * Split a batch for the fold: `urgent` entries bypass it (their own full
 * block), `foldable` are the non-urgent entries, and `isBurst` is true when
 * there are strictly more foldable entries than {@link ACTOR_BURST_FOLD_THRESHOLD}.
 */
export const splitAutomatedBurst = (
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
): {
  readonly urgent: ReadonlyArray<T3TeamActorMailboxEntry>;
  readonly foldable: ReadonlyArray<T3TeamActorMailboxEntry>;
  readonly isBurst: boolean;
} => {
  const urgent: T3TeamActorMailboxEntry[] = [];
  const foldable: T3TeamActorMailboxEntry[] = [];
  for (const entry of entries) {
    if (entry.urgency === "urgent") urgent.push(entry);
    else foldable.push(entry);
  }
  return { urgent, foldable, isBurst: foldable.length > ACTOR_BURST_FOLD_THRESHOLD };
};

/**
 * One compact line for a folded item: the message id (for t3team_read_message),
 * the sender, its thread, urgency, and a short subject (sender summary or an
 * auto-derived head, capped to the burst-item budget).
 */
export const automatedBurstItemLine = (entry: T3TeamActorMailboxEntry): string => {
  const senderSummary = entry.summary?.trim();
  const subject =
    senderSummary !== "" && senderSummary !== undefined
      ? capActorMessageSummary(senderSummary, ACTOR_BURST_ITEM_SUBJECT_MAX_CHARS)
      : autoSummarizeActorMessage(entry.text, ACTOR_BURST_ITEM_SUBJECT_MAX_CHARS);
  return (
    `- id ${entry.messageId} · «${entry.fromTitle}» · thread ${entry.fromThreadId} · ` +
    `${entry.urgency} — ${subject}`
  );
};

/**
 * The compact burst block: a header naming the count + the on-demand read
 * pointer, then one line per item. Returns "" when the batch is not a burst
 * (strictly more foldable entries than the threshold); callers then keep the
 * full per-entry form.
 */
export const renderAutomatedBurstBlock = (
  foldable: ReadonlyArray<T3TeamActorMailboxEntry>,
): string => {
  if (foldable.length <= ACTOR_BURST_FOLD_THRESHOLD) return "";
  const noun = foldable.length > 1 ? "messages" : "message";
  return [
    `[Inter-agent burst: ${foldable.length} ${noun} folded — deduplicated; ` +
      "read any in full with t3team_read_message]",
    ...foldable.map(automatedBurstItemLine),
  ].join("\n");
};
