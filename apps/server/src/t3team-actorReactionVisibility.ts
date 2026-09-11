/**
 * Inter-agent delivery visibility (GHE #156, part d of the #152 umbrella):
 * guarantee the user-facing response is not buried under an inter-agent
 * reaction turn. The strength of the appended instruction depends on WHY the
 * user-facing exchange is open:
 *   - the user's own message is still UNANSWERED → strong answer-first rule;
 *   - the user has not yet reacted to an agent REPLY → quiet rule: act on the
 *     agent messages only if they change the situation, no re-stating earlier
 *     user-facing content, no re-acknowledging standing instructions, and no
 *     status recap when nothing is new (chatter fix, follow-up to GHE #156).
 *
 * The trigger is detected CHEAPLY from turn/message origin — never by scanning
 * transcript text. A message's origin is its `t3teamExt`:
 *   - `t3teamExt.actor`  → inter-agent reaction input (the framed delivery)
 *   - `t3teamExt.author` → some other automated sender (system / workflow)
 *   - neither            → typed by a human (backward-compat contract, see
 *                          t3team-message-author.ts)
 *
 * @module t3team-actorReactionVisibility
 */
import type { OrchestrationMessage } from "@t3tools/contracts";

import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import {
  buildActorReactionBatchInput,
  buildActorReactionCompressedInput,
  buildActorReactionHeaderInput,
} from "./t3team-actorReactionInput.ts";

/**
 * A message the user actually sees and can react to: a human-typed user
 * message, or an assistant response. Inter-agent (`actor`) and automated
 * (`author`) inputs are NOT user-facing — they are the framing the reactor
 * hides from the user.
 */
type UserFacingRole = "user" | "assistant";

/**
 * Whether the thread has an open user-facing exchange that an inter-agent
 * reaction turn could bury.
 *
 * - `unanswered-user-message`: the most recent user-facing message is a human
 *   user message with no assistant reply after it — the agent owes the user a
 *   response.
 * - `unreacted-response`: the most recent user-facing message is an assistant
 *   response with no subsequent human message — the user has not yet read /
 *   reacted to the agent's answer.
 * - `closed`: no user-facing message exists (a purely inter-agent thread) —
 *   there is no user to return to, so no instruction is injected.
 */
export type ActorReactionUserContext =
  | { readonly kind: "open"; readonly reason: "unanswered-user-message" | "unreacted-response" }
  | { readonly kind: "closed" };

/**
 * Cheap origin test: is this a real, human-typed user message? Mirrors
 * `isRealUserMessage` in t3team-actorMessageSuppression.ts, but over the
 * projected `OrchestrationMessage` shape (same fields).
 */
function isRealUserMessage(message: OrchestrationMessage): boolean {
  return message.role === "user" && message.t3teamExt?.actor === undefined;
}

function userFacingRole(message: OrchestrationMessage): UserFacingRole | null {
  if (isRealUserMessage(message)) return "user";
  if (message.role === "assistant") return "assistant";
  return null;
}

/**
 * Detect the thread's open user-facing exchange from its message origin.
 *
 * Walks the projected messages in chronological order and keeps the LAST
 * user-facing message (a human user message or an assistant response). That
 * tail determines the state:
 *   - tail is a human user message  → `unanswered-user-message`
 *   - tail is an assistant response → `unreacted-response`
 *   - no user-facing message at all → `closed`
 *
 * No transcript scan: only role + `t3teamExt` origin are read.
 */
export function detectUserFacingOpenState(
  messages: ReadonlyArray<OrchestrationMessage> | null | undefined,
): ActorReactionUserContext {
  if (messages === null || messages === undefined || messages.length === 0) {
    return { kind: "closed" };
  }
  let lastRole: UserFacingRole | null = null;
  let lastAtMs = Number.NEGATIVE_INFINITY;
  for (const message of messages) {
    const role = userFacingRole(message);
    if (role === null) continue;
    const atMs = Date.parse(message.createdAt);
    // `>=` so that, on equal timestamps, the later (chronologically later)
    // message wins — the projection orders messages chronologically.
    if (atMs >= lastAtMs) {
      lastRole = role;
      lastAtMs = atMs;
    }
  }
  if (lastRole === null) {
    return { kind: "closed" };
  }
  return lastRole === "user"
    ? { kind: "open", reason: "unanswered-user-message" }
    : { kind: "open", reason: "unreacted-response" };
}

/**
 * The harness instruction injected into an inter-agent reaction turn when the
 * thread has an open user-facing exchange. Keeps the spirit of GHE #156:
 * do not let the inter-agent message bury the user's response, and re-state
 * the earlier user-facing content rather than assume the user still has it.
 */
export const ACTOR_REACTION_UNANSWERED_INSTRUCTION =
  "[Return to the user before anything else. The user's most recent message is still " +
  "unanswered: fully respond to it FIRST — before acting on any inter-agent message. " +
  "Mention the agent messages only if they change your answer.]";

/**
 * The quiet rule for reaction turns where the user merely has not yet reacted
 * to an agent reply (almost every queued inter-agent delivery): the turn must
 * not manufacture user-facing content — no re-stating, no re-acknowledging,
 * no status recap — unless the agent messages actually change the situation.
 */
export const ACTOR_REACTION_QUIET_INSTRUCTION =
  "[Inter-agent messages arrived. Act on them only if they change your situation. Do NOT " +
  "re-state or re-explain earlier user-facing content, and do NOT re-acknowledge standing " +
  "instructions. If there is nothing new for the user, keep your user-facing reply to one " +
  "short line — no status recap, no re-capping of work in flight. A hard blocker or " +
  "failure reported in the incoming messages is an exception: surface it directly, " +
  "concisely, even in quiet mode.]";

/**
 * The instruction to append to a reaction turn's framed input, or `""` when the
 * thread has no open user-facing exchange (nothing to return to).
 * Unanswered user message → strong answer-first rule; unreacted response →
 * quiet rule (no manufactured user-facing content).
 */
export function buildActorReactionUserReturnInstruction(context: ActorReactionUserContext): string {
  if (context.kind === "closed") return "";
  return context.reason === "unanswered-user-message"
    ? ACTOR_REACTION_UNANSWERED_INSTRUCTION
    : ACTOR_REACTION_QUIET_INSTRUCTION;
}

/**
 * Append the user-return instruction to a reaction turn's stable base input,
 * or return the base unchanged when the thread has no open user-facing
 * exchange. The base is kept EXACTLY as produced by the caller so the
 * restart-rehydrate matching (which rebuilds the single-entry base and
 * prefix-matches the stored input) keeps working; the instruction is a
 * well-known SUFFIX appended after the base.
 */
export function appendActorReactionUserReturnInstruction(
  baseInput: string,
  context: ActorReactionUserContext,
): string {
  const instruction = buildActorReactionUserReturnInstruction(context);
  return instruction === "" ? baseInput : `${baseInput}\n\n${instruction}`;
}

/**
 * The full reaction-turn input: the stable framed delivery (see
 * {@link buildActorReactionBatchInput}) plus the user-return instruction when
 * the thread has an open user-facing exchange.
 */
export function buildActorReactionTurnInput(
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
  context: ActorReactionUserContext,
  userInterjected = false,
  firstDelivery = true,
): string {
  // Three tiers:
  // 1. The user stepped in while the batch was queueing: compressed framing
  //    ("do not act by default, the user's message comes first").
  // 2. The thread's FIRST inter-agent delivery (the kickoff/handoff): full
  //    bodies — the recipient must be able to act without a fetch.
  // 3. Every later delivery: header-only; bodies stay fetchable via
  //    t3team_read_message so bursts do not inflate the recipient's context.
  const base =
    userInterjected && context.kind === "open"
      ? buildActorReactionCompressedInput(entries)
      : firstDelivery
        ? buildActorReactionBatchInput(entries)
        : buildActorReactionHeaderInput(entries);
  return appendActorReactionUserReturnInstruction(base, context);
}
