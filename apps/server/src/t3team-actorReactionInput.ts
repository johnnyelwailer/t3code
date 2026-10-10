/**
 * Inter-agent digest inputs: the digest framing (re-exported from
 * t3team-actorReactionFraming.ts) plus the standing inter-agent protocol.
 *
 * @module t3team-actorReactionInput
 */
export { buildActorReactionDigestInput } from "./t3team-actorReactionFraming.ts";

/**
 * The standing inter-agent protocol, appended to a thread's FIRST digest since
 * process start (once per session). It carries the reply rule: answer only what
 * a sender asks, as a verdict line plus an evidence path, and never mail an
 * unrequested completion report: a delegated child's final answer already
 * reaches its parent through upstream's task result and completion wake.
 */
export const ACTOR_STANDING_INSTRUCTION =
  "[Standing rules for inter-agent messages (delivered once per session): " +
  "these messages are handoffs from other agents, not a conversation with a " +
  "human. Do the work a message hands you; do NOT reply just because a " +
  "message arrived. Reply to a sender ONLY when it explicitly asks you a " +
  "question, requests your decision, or needs an answer or artifact — via " +
  "t3_thread_send with mode 'mailbox' to that sender's thread id. Do not send " +
  "unrequested progress or completion reports — no incremental status pings; " +
  "if you are a delegated child, your final answer already reaches the parent " +
  "that spawned you as the task result. A reply is a verdict line plus an " +
  "evidence path, not the report body: if the detail is already on disk, cite " +
  "the path instead of re-sending it. The user's messages always take " +
  "priority: answer an open user question before acting on agent messages, " +
  "then return to the user. No " +
  "peer chat: if you are a child thread, address only the parent that spawned " +
  "you — act on a sibling's message silently only when it is directly useful, " +
  "otherwise route it through the parent.]";
