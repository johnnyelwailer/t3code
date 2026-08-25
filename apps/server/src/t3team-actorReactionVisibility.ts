/**
 * Inter-agent delivery visibility (GHE #156, part d of the #152 umbrella):
 * guarantee the user-facing response is not buried under an inter-agent
 * reaction turn. Even coalesced / summarized / held, a reaction turn can
 * still "swallow" the user's answer, so when the thread has an OPEN
 * user-facing exchange we wrap the inter-agent delivery with a harness
 * instruction that (a) tells the agent to return to the user and confirm they
 * read + reacted to its own message, and (b) requires it to RE-STATE its
 * earlier user-facing content rather than assume the user still has it.
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
import { buildActorReactionBatchInput } from "./t3team-actorReactionInput.ts";

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
export const ACTOR_REACTION_USER_RETURN_INSTRUCTION =
  "[Return to the user before anything else. Messages from other threads arrived — do not " +
  "prioritize them. FIRST make sure the user has read your message and responded to any open " +
  "points. You may still act on the agent messages, but your LAST action must be to respond to " +
  "the user and summarize the recent conversation. Because inter-agent messages arrived in " +
  "between, RE-STATE / RE-EXPLAIN your earlier user-facing content (the question you posed, the " +
  "decision you made, the status you gave) — do NOT assume the user still has it.]";

/**
 * The instruction to append to a reaction turn's framed input, or `""` when the
 * thread has no open user-facing exchange (nothing to return to).
 */
export function buildActorReactionUserReturnInstruction(context: ActorReactionUserContext): string {
  return context.kind === "open" ? ACTOR_REACTION_USER_RETURN_INSTRUCTION : "";
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
): string {
  return appendActorReactionUserReturnInstruction(buildActorReactionBatchInput(entries), context);
}
