/**
 * The corrective re-ask and the exhaustion reason for a schema-bearing ask (Epic 25 §The thread
 * model: "re-asks on a mismatch, then throws SchemaExhaustedError"), split out of `askVerb.ts`
 * so the dispatch loop stays a loop.
 *
 * An AGENT correction carries the signal a model needs to repair its own answer: the decode
 * detail, its own previous reply quoted back, the rule that the step's result IS this turn's
 * reply (an agent that ends its turn to wait for a background-job notice has already answered),
 * and a JSON-only instruction next to the schema shape. A `user.input` correction is read by a
 * human with an affordance, so it keeps its original wording — and its journaled payload hash.
 *
 * Every string here is a pure function of (replay-stable) schema, prompt and recorded reply, so a
 * replayed correction re-derives the same payload and `argsHash`.
 */

import type * as Schema from "effect/Schema";

import { sketchSchema } from "./schemaSketch.ts";

/** Upper bound on the quoted previous reply in a correction prompt. */
const QUOTED_REPLY_MAX = 1500;

function replyText(reply: unknown): string {
  if (typeof reply === "string") return reply;
  try {
    return JSON.stringify(reply) ?? String(reply);
  } catch {
    // BigInt / circular: still quote something rather than kill the retry loop.
    return String(reply);
  }
}

/** Truncate to at most `max` UTF-16 units, never splitting a surrogate pair. */
function bounded(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

/**
 * A bounded, single-line view of the reply that last missed the schema, so the exhaustion error
 * names what actually arrived. Without it the decode detail is just "Expected object" and the
 * failure is unreadable — and the owner's contract is a decode error WITH the offending payload.
 */
export function offendingReply(reply: unknown): string {
  return bounded(replyText(reply).replace(/\s+/g, " ").trim(), 160);
}

/**
 * The corrective prompt exactly as the previous version worded it for every kind. Journals written
 * before the agent correction was reworded hash THIS payload, so the ask loop offers it as the
 * call's `legacyArgs` and those runs still replay (see `HandleSendCall.legacyArgs`).
 */
export function legacyCorrectivePrompt(input: {
  readonly basePrompt: string;
  readonly detail: string;
  readonly instruction: string;
}): string {
  return `${input.basePrompt}\n\nYour previous reply did not match the required schema (${input.detail}). ${input.instruction}`;
}

/** The prompt for the next attempt after `reply` failed to decode with `detail`. */
export function correctivePrompt(input: {
  readonly kind: "thread.turn" | "user.input";
  readonly basePrompt: string;
  readonly detail: string;
  readonly reply: unknown;
  /** The affordance/schema instruction from `planAskRender`. */
  readonly instruction: string;
}): string {
  if (input.kind === "user.input") return legacyCorrectivePrompt(input);
  return [
    `${input.basePrompt}\n\nYour previous reply did not match the required schema (${input.detail}).`,
    "Your previous reply was:",
    "<<<",
    bounded(replyText(input.reply).trim(), QUOTED_REPLY_MAX),
    ">>>",
    "This step's result is your reply to THIS message: the step ends when your turn ends. If you " +
      "started background work, finish waiting for it inside this turn — do not end the turn to " +
      "wait for a notification.",
    "Reply with the JSON value only — no prose, no preamble, no code fence.",
    input.instruction,
  ].join("\n");
}

/** The `SchemaExhaustedError` message: which ask, which schema, why, and what last arrived. */
export function exhaustedReason(input: {
  readonly kind: string;
  readonly threadId: string;
  readonly attempts: number;
  readonly schema: Schema.Schema<unknown>;
  readonly detail: string;
  readonly reply: unknown;
}): string {
  const expected = bounded(sketchSchema(input.schema).text.replace(/\s+/g, " "), 200);
  return (
    `${input.kind} on thread '${input.threadId}' did not satisfy the response schema after ` +
    `${input.attempts} attempts: ${input.detail}; expected: ${expected}; ` +
    `last reply: ${offendingReply(input.reply)}`
  );
}
