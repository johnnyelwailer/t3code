/**
 * The two effort dials on `t3team.thread.start_child`, parsed in one place (split out of
 * `t3team-toolBrokerStartChildArgs.ts` for the additive LOC budget):
 *
 *   • `reasoning_effort` — the provider's OWN vocabulary (`low` / `medium` / `high`), written
 *     straight onto the matching select option. Requires the caller to know the provider.
 *   • `effort` — the provider-AGNOSTIC tier (`light` / `standard` / `high`), the same ladder
 *     workflow child turns use. Mapped by `applyWorkflowEffort` against whatever reasoning
 *     control the resolved provider/model advertises, and a documented no-op when it advertises
 *     none. This is the one an agent can use without naming a provider or a model.
 *
 * `reasoning_effort` is the more specific request, so it wins when both are supplied.
 */

import type { AgentEffort } from "@t3team/sdk";

export type T3TeamStartChildReasoningEffort = "low" | "medium" | "high";

const REASONING_EFFORTS = new Set<T3TeamStartChildReasoningEffort>(["low", "medium", "high"]);
const AGENT_EFFORTS = new Set<AgentEffort>(["light", "standard", "high"]);

type ParseResult<T> =
  | { readonly ok: true; readonly value: T | undefined }
  | { readonly ok: false; readonly message: string };

const parseEnum = <T extends string>(
  raw: unknown,
  allowed: ReadonlySet<T>,
  message: string,
): ParseResult<T> => {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false, message };
  const normalized = raw.trim().toLowerCase() as T;
  return allowed.has(normalized) ? { ok: true, value: normalized } : { ok: false, message };
};

/** `reasoning_effort` → the provider's own low/medium/high select value. */
export const readStartChildReasoningEffort = (
  raw: unknown,
): ParseResult<T3TeamStartChildReasoningEffort> =>
  parseEnum(
    raw,
    REASONING_EFFORTS,
    "t3team.thread.start_child 'reasoning_effort' must be one of 'low', 'medium', or 'high'.",
  );

/** `effort` → the provider-agnostic light/standard/high tier. */
export const readStartChildEffort = (raw: unknown): ParseResult<AgentEffort> =>
  parseEnum(
    raw,
    AGENT_EFFORTS,
    "t3team.thread.start_child 'effort' must be one of 'light', 'standard', or 'high'. " +
      "It is provider-agnostic — do not pass a provider's own reasoning value here.",
  );
