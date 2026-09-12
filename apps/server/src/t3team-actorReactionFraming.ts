/**
 * Inter-agent reaction TURN FRAMING (split from t3team-actorReactionInput.ts
 * so that file keeps only its restart-rehydrate matcher + the standing
 * instruction): the single digest base plus the legacy single-entry bases an
 * admitted reaction turn may have been framed with.
 *
 * {@link buildActorReactionDigestInput} is THE single framing for a claimed
 * batch (one turn per batch, with the GHE #157 burst fold). The three legacy
 * bases are rehydrate-matching ONLY — pre-overhaul admitted inputs keep
 * prefix-matching on restart; they are NEVER used for new turns. This module
 * produces the delivery text; it owns no state and does no matching, so a
 * change here is a delivery-shape concern, not a matcher concern.
 *
 * @module t3team-actorReactionFraming
 */
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import {
  autoSummarizeActorMessage,
  capActorMessageSummary,
  summarizeActorMessageForDelivery,
  summarizeActorMessageForDeliveryLegacy,
} from "./t3team-actorReactionInputSummarize.ts";
import {
  renderAutomatedBurstBlock,
  splitAutomatedBurst,
} from "./t3team-actorBurstFold.ts";

/**
 * The SINGLE digest framing for a CLAIMED BATCH of deliveries: one reaction
 * turn per batch instead of one turn per message. Deterministic for a given
 * batch — including the single-entry shape — which is what the restart
 * rehydrate prefix-matching relies on.
 *
 * Burst fold (GHE #157): when a batch carries more than the fold threshold of
 * non-urgent entries, those are rendered as ONE compact list (one line each +
 * a t3team_read_message pointer) instead of one verbose block each; urgent
 * entries keep their own full block. Sub-threshold (and single-entry) batches
 * keep the full per-entry shape EXACTLY, so the rehydrate matcher is
 * unaffected.
 */
export const buildActorReactionDigestInput = (
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
): string => {
  const fullBlock = (entry: T3TeamActorMailboxEntry): string[] => [
    `[from «${entry.fromTitle}» · thread ${entry.fromThreadId} · id ${entry.messageId} · ` +
      `urgency ${entry.urgency}]`,
    "",
    summarizeActorMessageForDelivery(entry.text, entry.messageId, entry.summary),
    "",
  ];
  const header = `[Inter-agent digest: ${entries.length} message(s)]`;
  const { urgent, foldable, isBurst } = splitAutomatedBurst(entries);
  if (!isBurst) return [header, "", ...entries.flatMap(fullBlock)].join("\n");
  const parts: string[] = [header, ""];
  if (urgent.length > 0) parts.push(...urgent.flatMap(fullBlock));
  if (foldable.length > 0) parts.push(renderAutomatedBurstBlock(foldable));
  parts.push("");
  return parts.join("\n");
};

// --- Legacy single-entry bases (rehydrate matching only) ---------------------
//
// Admitted reaction inputs persisted BEFORE the digest framing used one of
// these bases. A restart replays the full event log, so collectPending
// ActorDeliveries must still recognize them as already reacted — otherwise
// every old single-entry delivery is re-queued and the thread double-reacts
// to work it already handled. NEVER used for NEW turns.

/**
 * LEGACY (pre-overhaul): full-body single-message delivery framing.
 * Byte-faithful to the historical tier — including the legacy 1500-char
 * inline cap and `…[summarized —` marker — so old admitted inputs keep
 * prefix-matching on restart. NEVER used for NEW turns.
 */
export const buildActorReactionInput = (entry: T3TeamActorMailboxEntry): string =>
  [
    `[Message from peer agent «${entry.fromTitle}» · thread ${entry.fromThreadId} · ` +
      `urgency ${entry.urgency}]`,
    "",
    summarizeActorMessageForDeliveryLegacy(entry.text, entry.messageId, entry.summary),
    "",
    "[This message is from another agent actor, not a human user. An inter-agent message is " +
      "a handoff, not a conversation: do NOT reply just because a message arrived. Reply to " +
      "the sender ONLY when its content explicitly asks you a question, requests your " +
      "decision, or asks for an answer or artifact from you — otherwise do the work it hands " +
      "you and continue your own task. Solve simple blockers yourself; escalate only for " +
      "genuine blockers (a user decision, a cross-lane change, or access you lack). No peer " +
      "chat: if you are a child thread, address ONLY the parent thread that spawned you — " +
      "never start or continue a conversation with sibling threads; act on a sibling's " +
      "message silently only when it is directly useful to your task, otherwise route it " +
      "through the parent. Report " +
      "progress at most once, when you are completely done — no incremental status pings. To " +
      "reply to the sender, use your send-message tool addressed to thread " +
      `${entry.fromThreadId}. Keep inter-agent messages short (telegram style: state, ` +
      "decision, request). Put details in an attached markdown report or a file the " +
      "recipient can read on demand; long bodies are summarized on delivery and the " +
      "recipient retrieves the full text with t3team_read_message.]",
    ,
  ].join("\n");

/**
 * LEGACY (GHE #154): header-only single-delivery framing (follow-ups). The
 * subject line is the capped sender summary when present, else the auto-
 * derivation — exactly as the historical tier produced it.
 */
export const buildActorReactionHeaderSingleInput = (entry: T3TeamActorMailboxEntry): string =>
  [
    `[Message from peer agent «${entry.fromTitle}» · thread ${entry.fromThreadId} · ` +
      `urgency ${entry.urgency}]`,
    "",
    `${
      entry.summary?.trim()
        ? capActorMessageSummary(entry.summary)
        : autoSummarizeActorMessage(entry.text)
    }\n…[body NOT loaded into your context — call t3team_read_message ` +
      `with message id ${entry.messageId} to read the full text when you need it]`,
    "",
    "[Handoff, not conversation: do NOT reply just because a message arrived. Reply ONLY " +
      "when the header explicitly asks you a question, requests your decision, or asks for " +
      "an answer or artifact — otherwise act on it (fetching bodies with t3team_read_message " +
      "as needed) and continue your own task. Report progress at most once, when you are " +
      "completely done. No peer chat: if you are a child thread, address only the parent " +
      "that spawned you.]",
  ].join("\n");

/** LEGACY (GHE #156): compressed pointer-only framing (user interjected). */
export const buildActorReactionCompressedInput = (
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
): string => {
  const grouped = new Map<string, { title: string; ids: string[] }>();
  for (const entry of entries) {
    const group = grouped.get(entry.fromThreadId) ?? { title: entry.fromTitle, ids: [] };
    group.ids.push(entry.messageId);
    grouped.set(entry.fromThreadId, group);
  }
  const lines = [...grouped.entries()].map(([threadId, group]) => {
    const noun = group.ids.length > 1 ? "messages" : "message";
    return (
      ` - ${group.ids.length} ${noun} from «${group.title}» (thread ${threadId}): ` +
      group.ids.join(", ")
    );
  });
  return [
    `[Inter-agent messages queued while the user was engaged — the user's message comes FIRST]`,
    "",
    ...lines,
    "",
    "[Do not act on these by default. Retrieve a full body with " +
      "t3team_read_message(message_id) ONLY when you genuinely need it to unblock or " +
      "change your plan — otherwise just note that it arrived. When your turn ends, " +
      "return to the user and the user's message.]",
  ].join("\n");
};
