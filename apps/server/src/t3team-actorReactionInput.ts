/**
 * Inter-agent ("actor") reaction inputs: the restart-rehydrate matcher plus
 * the standing inter-agent protocol.
 *
 * The TURN FRAMING (the single digest base + the legacy single-entry bases)
 * lives in t3team-actorReactionFraming.ts and is re-exported here so existing
 * importers keep one path. The matcher below is the load-bearing half: after
 * a restart, a delivery whose reaction was already admitted must NOT be
 * re-queued, otherwise the thread double-reacts. Matching is:
 *   1. PRIMARY: the admitted reaction turn's `t3teamExt.actor.messageIds`
 *      names every coalesced delivery (startActorReaction always sets it,
 *      including single entries) — format-independent.
 *   2. LEGACY: admitted inputs WITHOUT messageIds (single-entry turns admitted
 *      before messageIds became universal) are recognized by prefix-matching
 *      the stored text against the single-entry bases of the digest framing
 *      AND the historical framings that may still exist in persisted logs.
 *
 * @module t3team-actorReactionInput
 */
import type { OrchestrationEvent } from "@t3tools/contracts";

import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import {
  buildActorReactionCompressedInput,
  buildActorReactionDigestInput,
  buildActorReactionHeaderSingleInput,
  buildActorReactionInput,
} from "./t3team-actorReactionFraming.ts";

export {
  buildActorReactionCompressedInput,
  buildActorReactionDigestInput,
  buildActorReactionHeaderSingleInput,
  buildActorReactionInput,
};

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
