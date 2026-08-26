/**
 * Human-steering context (GHE #209): when a human is actively steering this
 * thread, tell the agent — each turn — not to proactively ping the parent
 * thread. The legitimate "report back to the parent" channel is NOT blocked
 * (no hard backstop on send-message): this computed context line reduces
 * unprompted chatter while a human is at the keyboard, and Part 2 of #209
 * makes outbound inter-agent messages visible in the sender's timeline.
 *
 * Injected at the same seam that wraps an inter-agent reaction turn with the
 * user-return instruction (t3team-actorReactionVisibility.ts, consumed by
 * t3team-actorMessageReaction.ts): as a well-known SUFFIX after the stable
 * framed base, so the restart-rehydrate prefix matching (which rebuilds the
 * single-entry base and prefix-matches the stored input) keeps working.
 *
 * The trigger is DETERMINISTIC — computed from real message roles and
 * timestamps, never LLM-guessed. A message's origin is its `t3teamExt`:
 *   - `t3teamExt.actor`  → inter-agent reaction input (NOT a human)
 *   - neither            → typed by a human / system-started (same cheap
 *                          origin test t3team-actorReactionVisibility.ts uses)
 *
 * The "recent" window defaults to EITHER of two sub-signals (documented
 * default: a user message within the last ~2 agent turns OR ~10 minutes):
 *   - within the last N agent turns (assistant messages since the last user
 *     message) — the human is still iterating on the agent's output, or
 *   - within the last T milliseconds — the human just typed.
 * Either sub-signal alone indicates active human involvement, and the line
 * itself states the measured age so the agent can judge freshness. Both are
 * distribution-tunable via environment variables.
 *
 * @module t3team-actorSteeringContext
 */
import type { OrchestrationMessage, OrchestrationThread } from "@t3tools/contracts";
import { findHandoffParentThreadId } from "./t3team-childAbnormalStopNotify.ts";

/** Default: a user message within the last N agent turns counts as steering. */
export const STEERING_MAX_AGENT_TURNS_DEFAULT = 2;
/** Default: a user message within the last T milliseconds counts as steering. */
export const STEERING_MAX_AGE_MS_DEFAULT = 10 * 60 * 1000;
const STEERING_MAX_AGENT_TURNS_ENV = "T3TEAM_STEERING_MAX_AGENT_TURNS";
const STEERING_MAX_AGE_MS_ENV = "T3TEAM_STEERING_MAX_AGE_MS";

/**
 * Resolve the agent-turn recency bound, honoring the env override (mirrors the
 * delivery-cap resolver in t3team-actorReactionInput.ts).
 */
export function resolveSteeringMaxAgentTurns(): number {
  const raw = process.env[STEERING_MAX_AGENT_TURNS_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return STEERING_MAX_AGENT_TURNS_DEFAULT;
}

/**
 * Resolve the age bound in milliseconds, honoring the env override.
 */
export function resolveSteeringMaxAgeMs(): number {
  const raw = process.env[STEERING_MAX_AGE_MS_ENV]?.trim();
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return STEERING_MAX_AGE_MS_DEFAULT;
}

/**
 * The deterministic human-steering signal for a thread.
 *
 * - `steering`: the most recent user message (role "user" with no
 *   `t3teamExt.actor` — inter-agent reaction inputs are excluded) is recent,
 *   i.e. within the last N agent turns OR the last T milliseconds.
 * - `idle`: no user message exists, or the most recent one is stale on both
 *   sub-signals.
 */
export type HumanSteeringState =
  | {
      readonly kind: "steering";
      readonly lastUserMessageAgeMs: number;
      readonly agentTurnsSinceLastUserMessage: number;
    }
  | { readonly kind: "idle" };

/**
 * Cheap origin test: is this a user-typed (non-inter-agent) user message?
 * Mirrors `isRealUserMessage` in t3team-actorReactionVisibility.ts over the
 * same projected `OrchestrationMessage` shape — only role + `t3teamExt`
 * origin are read, no transcript scan.
 */
function isRealUserMessage(message: OrchestrationMessage): boolean {
  return message.role === "user" && message.t3teamExt?.actor === undefined;
}

/**
 * Compute the human-steering state from the thread's projected messages and a
 * `now` in epoch milliseconds (injected so tests stay deterministic).
 *
 * The projection orders messages chronologically; like the user-facing open
 * state detection, the walk keeps the LAST user message by `>=` on
 * timestamps so equal timestamps resolve to the array-later message. Agent
 * turns are the assistant messages at-or-after that user message.
 */
export function detectHumanSteeringState(
  messages: ReadonlyArray<OrchestrationMessage> | null | undefined,
  nowMs: number,
  options?: {
    readonly maxAgentTurns?: number;
    readonly maxAgeMs?: number;
  },
): HumanSteeringState {
  if (messages === null || messages === undefined || messages.length === 0) {
    return { kind: "idle" };
  }
  const maxAgentTurns = options?.maxAgentTurns ?? resolveSteeringMaxAgentTurns();
  const maxAgeMs = options?.maxAgeMs ?? resolveSteeringMaxAgeMs();

  let lastUserAtMs = Number.NEGATIVE_INFINITY;
  for (const message of messages) {
    if (!isRealUserMessage(message)) continue;
    const atMs = Date.parse(message.createdAt);
    if (atMs >= lastUserAtMs) {
      lastUserAtMs = atMs;
    }
  }
  if (lastUserAtMs === Number.NEGATIVE_INFINITY) {
    return { kind: "idle" };
  }

  let agentTurns = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    if (Date.parse(message.createdAt) >= lastUserAtMs) {
      agentTurns += 1;
    }
  }

  const ageMs = Math.max(0, nowMs - lastUserAtMs);
  if (agentTurns <= maxAgentTurns || ageMs <= maxAgeMs) {
    return {
      kind: "steering",
      lastUserMessageAgeMs: ageMs,
      agentTurnsSinceLastUserMessage: agentTurns,
    };
  }
  return { kind: "idle" };
}

/**
 * The harness instruction appended to a turn's context when a human is
 * steering and the thread has a parent. `""` when the signal is idle OR the
 * thread has no parent (root threads and workflow-owned children are a
 * no-op: there is no parent to ping).
 */
export function buildHumanSteeringInstruction(
  state: HumanSteeringState,
  parentThreadId: string | null | undefined,
): string {
  if (state.kind !== "steering" || parentThreadId === undefined || parentThreadId === null) {
    return "";
  }
  const ageMinutes = Math.max(1, Math.round(state.lastUserMessageAgeMs / 60000));
  return (
    `[A human is steering this thread right now (last user message ~${ageMinutes} min ago). ` +
    "Respond to them directly. Do NOT send inter-agent messages to the parent unless they " +
    "explicitly ask.]"
  );
}

/**
 * Append the human-steering instruction to a turn's stable base context, or
 * return the base unchanged when there is nothing to inject. The base is kept
 * EXACTLY as produced by the caller so the restart-rehydrate prefix matching
 * (which prefix-matches the stored input against the rebuilt base) keeps
 * working; the instruction is a well-known SUFFIX appended after the base —
 * the same contract the user-return instruction in
 * t3team-actorReactionVisibility.ts follows.
 */
export function appendHumanSteeringInstruction(baseInput: string, instruction: string): string {
  return instruction === "" ? baseInput : `${baseInput}\n\n${instruction}`;
}

/**
 * The GHE #209 human-steering SUFFIX for a reaction turn, computed from the
 * thread's own durable state: non-empty only when a real user message is
 * recent AND the thread has a parent (root threads and workflow-owned
 * children have no parent → no-op). Kept here so the reaction dispatch stays
 * thin — the caller only decides WHERE the suffix rides in the turn input.
 */
export function humanSteeringInstructionForThread(
  thread: Pick<OrchestrationThread, "messages" | "activities">,
  nowMillis: number,
): string {
  return buildHumanSteeringInstruction(
    detectHumanSteeringState(thread.messages, nowMillis),
    findHandoffParentThreadId(thread.activities),
  );
}
