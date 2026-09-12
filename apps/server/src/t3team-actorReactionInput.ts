/**
 * Inter-agent ("actor") reaction inputs: the SINGLE digest framing plus the
 * restart-rehydrate matcher.
 *
 * Delivery model (inter-agent messaging overhaul): actor messages no longer
 * drive individual turns. They accumulate in the mailbox and are delivered as
 * ONE consolidated digest at a boundary (the thread is idle and the user is
 * not actively engaged — see t3team-actorMessageReactor.ts). The digest is the
 * ONLY framing:
 *
 *   - one line per delivery: sender, thread id, message id, urgency;
 *   - bodies at or under the inline cap are inlined verbatim;
 *   - bodies above it arrive as the SUBJECT plus a t3team_read_message pointer.
 *
 * The standing inter-agent protocol (handoff-not-conversation, report-once,
 * user-priority, no peer chat) is delivered ONCE per session, not per
 * message: it is appended to the FIRST digest a thread receives since process
 * start ({@link ACTOR_STANDING_INSTRUCTION}, gated by the mailbox's
 * `isBriefed`/`markBriefed`). It is a well-known SUFFIX so the restart
 * rehydrate's prefix-matching of the digest base keeps working.
 *
 * `collectPendingActorDeliveries` is the B4 invariant: after a restart, a
 * delivery whose reaction was already admitted must NOT be re-queued —
 * otherwise the thread double-reacts. Matching is:
 *   1. PRIMARY: the admitted reaction turn's `t3teamExt.actor.messageIds`
 *      names every coalesced delivery (startActorReaction always sets it,
 *      including single entries) — format-independent.
 *   2. LEGACY: admitted inputs WITHOUT messageIds (single-entry turns admitted
 *      before messageIds became universal, i.e. pre-overhaul logs) are
 *      recognized by prefix-matching the stored text against the single-entry
 *      bases of the digest framing AND the historical framings (full-body,
 *      header-only, compressed) that may still exist in persisted logs.
 *
 * @module t3team-actorReactionInput
 */
import type { OrchestrationEvent } from "@t3tools/contracts";

import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

import {
  autoSummarizeActorMessage,
  capActorMessageSummary,
  summarizeActorMessageForDelivery,
  summarizeActorMessageForDeliveryLegacy,
} from "./t3team-actorReactionInputSummarize.ts";

/**
 * The standing inter-agent protocol, appended to a thread's FIRST digest since
 * process start (once per session/provider-context lifetime). Everything the
 * old per-envelope boilerplate enforced now lives here, plus the reporting
 * rule: a completion report is a verdict line plus an evidence path, not the
 * report body.
 */
export const ACTOR_STANDING_INSTRUCTION =
  "[Standing rules for inter-agent messages (delivered once per session): " +
  "these messages are handoffs from other agents, not a conversation with a " +
  "human. Do the work a message hands you; do NOT reply just because a " +
  "message arrived. Reply to a sender ONLY when it explicitly asks you a " +
  "question, requests your decision, or needs an answer or artifact — via " +
  "send_message to that sender's thread id. Report progress at most once, " +
  "when you are completely done — no incremental status pings. A completion " +
  "report is a verdict line plus an evidence path, not the report body: if " +
  "the detail is already on disk, cite the path instead of re-sending it. The " +
  "user's messages always take priority: answer an open user question before " +
  "acting on agent messages, then return to the user. No peer chat: if you " +
  "are a child thread, address only the parent that spawned you — act on a " +
  "sibling's message silently only when it is directly useful, otherwise " +
  "route it through the parent.]";

/**
 * The SINGLE digest framing for a CLAIMED BATCH of deliveries: one reaction
 * turn per batch instead of one turn per message. Deterministic for a given
 * batch — including the single-entry shape — which is what the restart
 * rehydrate prefix-matching relies on.
 */
export const buildActorReactionDigestInput = (
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
): string =>
  [
    `[Inter-agent digest: ${entries.length} message(s)]`,
    "",
    ...entries.flatMap((entry) => [
      `[from «${entry.fromTitle}» · thread ${entry.fromThreadId} · id ${entry.messageId} · ` +
        `urgency ${entry.urgency}]`,
      "",
      summarizeActorMessageForDelivery(entry.text, entry.messageId, entry.summary),
      "",
    ]),
  ].join("\n");

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

// --- Restart rehydrate -------------------------------------------------------

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

/**
 * The single-entry bases an admitted reaction turn may have been framed with.
 * The NEW digest base first; the legacy bases so pre-overhaul logs keep
 * matching (see module docs, B4 invariant).
 */
const singleEntryBases = (entry: T3TeamActorMailboxEntry): ReadonlyArray<string> => [
  buildActorReactionDigestInput([entry]),
  buildActorReactionInput(entry),
  buildActorReactionHeaderSingleInput(entry),
  buildActorReactionCompressedInput([entry]),
];

/**
 * Replay deliveries and their admitted reaction inputs, leaving only PENDING
 * work. This is the function a restart double-reaction flows through: every
 * delivery whose reaction was already admitted must be removed here.
 */
export function collectPendingActorDeliveries(
  events: ReadonlyArray<OrchestrationEvent>,
  hopCap: number,
): ReadonlyArray<{ readonly threadId: string; entry: T3TeamActorMailboxEntry }> {
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
    // PRIMARY (format-independent): a reaction turn's `actor.messageIds`
    // names its WHOLE batch (startActorReaction always sets it, including
    // single entries) — every delivery it carries is already reacted.
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
    // LEGACY: single-entry admitted inputs without messageIds (pre-overhaul
    // logs). The bases embed message ids, but the identity guards apply to
    // EVERY base (the digest base aside — its header line carries the id,
    // sender thread, and urgency; the guards below still apply).
    const index = pending.findIndex(
      ({ threadId, entry }) =>
        threadId === event.payload.threadId &&
        entry.fromThreadId === actor.senderThreadId &&
        entry.hopCount === actor.hopCount &&
        entry.rootThreadId === actor.rootThreadId &&
        singleEntryBases(entry).some((base) => event.payload.text.startsWith(base)),
    );
    if (index >= 0) pending.splice(index, 1);
  }
  return pending;
}
