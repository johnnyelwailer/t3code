import { type ProviderInteractionMode } from "@t3tools/contracts";
import type { AgentEffort } from "@t3team/sdk";

import {
  readStartChildEffort,
  readStartChildReasoningEffort,
  type T3TeamStartChildReasoningEffort,
} from "./t3team-toolBrokerStartChildEffortArgs.ts";

export type T3TeamStartChildKickoffMode = "plan" | "interactive" | "autopilot";
export type { T3TeamStartChildReasoningEffort };
export type T3TeamStartChildExecutionScope = "metarepo" | "repository";

export type T3TeamStartChildArgs = {
  readonly name: string;
  readonly executionScope: T3TeamStartChildExecutionScope;
  readonly ticketId?: string;
  readonly kickoffPrompt?: string;
  readonly kickoffMode?: T3TeamStartChildKickoffMode;
  readonly provider?: string;
  readonly model?: string;
  readonly reasoningEffort?: T3TeamStartChildReasoningEffort;
  /**
   * Provider-AGNOSTIC thinking tier, the same ladder workflow child turns use
   * ({@link applyWorkflowEffort}): the caller asks for `light` / `standard` / `high` without
   * naming a provider, a model, or that provider's own vocabulary. Ignored when the explicit,
   * provider-specific `reasoningEffort` is also given (that one is more specific), and a
   * documented no-op on a provider that exposes no reasoning control.
   */
  readonly effort?: AgentEffort;
  readonly repoFullName?: string;
  readonly repoRef?: string;
};

type T3TeamStartChildArgsResult =
  | { readonly ok: true; readonly value: T3TeamStartChildArgs }
  | { readonly ok: false; readonly message: string };

const START_CHILD_KICKOFF_MODES = new Set<T3TeamStartChildKickoffMode>([
  "plan",
  "interactive",
  "autopilot",
]);
const START_CHILD_EXECUTION_SCOPES = new Set<T3TeamStartChildExecutionScope>([
  "metarepo",
  "repository",
]);

/** A non-empty trimmed string from an unknown candidate value, else undefined. */
const trimmedArg = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

export const readStartChildArgs = (value: unknown): T3TeamStartChildArgsResult => {
  if (!value || typeof value !== "object" || globalThis.Array.isArray(value)) {
    return {
      ok: false,
      message: "t3team.thread.start_child requires an object with at least a non-empty 'name'.",
    };
  }

  const candidate = value as {
    readonly name?: unknown;
    readonly title?: unknown;
    readonly ticket_id?: unknown;
    readonly kickoff_prompt?: unknown;
    readonly kickoff_mode?: unknown;
    readonly execution_scope?: unknown;
    readonly provider?: unknown;
    readonly model?: unknown;
    readonly reasoning_effort?: unknown;
    readonly effort?: unknown;
    readonly repo_full_name?: unknown;
    readonly repo_ref?: unknown;
  };

  const rawName = typeof candidate.name === "string" ? candidate.name : candidate.title;
  if (typeof rawName !== "string" || rawName.trim().length === 0) {
    return {
      ok: false,
      message: "t3team.thread.start_child requires a non-empty 'name' (or legacy 'title').",
    };
  }

  const name = rawName.trim();
  if (typeof candidate.execution_scope !== "string") {
    return {
      ok: false,
      message:
        "t3team.thread.start_child requires 'execution_scope' set to 'metarepo' or 'repository'.",
    };
  }
  const executionScope = candidate.execution_scope
    .trim()
    .toLowerCase() as T3TeamStartChildExecutionScope;
  if (!START_CHILD_EXECUTION_SCOPES.has(executionScope)) {
    return {
      ok: false,
      message:
        "t3team.thread.start_child 'execution_scope' must be exactly 'metarepo' or 'repository'. Use 'metarepo' for project planning/triage/synthesis and 'repository' for code, tests, debugging, review, or PR work.",
    };
  }

  const ticketId =
    typeof candidate.ticket_id === "string" && candidate.ticket_id.trim().length > 0
      ? candidate.ticket_id.trim()
      : undefined;
  const kickoffPrompt =
    typeof candidate.kickoff_prompt === "string" && candidate.kickoff_prompt.trim().length > 0
      ? candidate.kickoff_prompt.trim()
      : undefined;

  let kickoffMode: T3TeamStartChildKickoffMode | undefined;
  if (candidate.kickoff_mode !== undefined) {
    if (typeof candidate.kickoff_mode !== "string") {
      return {
        ok: false,
        message:
          "t3team.thread.start_child 'kickoff_mode' must be one of 'plan', 'interactive', or 'autopilot'.",
      };
    }
    const normalized = candidate.kickoff_mode.trim().toLowerCase() as T3TeamStartChildKickoffMode;
    if (!START_CHILD_KICKOFF_MODES.has(normalized)) {
      return {
        ok: false,
        message:
          "t3team.thread.start_child 'kickoff_mode' must be one of 'plan', 'interactive', or 'autopilot'.",
      };
    }
    kickoffMode = normalized;
  }

  const reasoning = readStartChildReasoningEffort(candidate.reasoning_effort);
  if (!reasoning.ok) return reasoning;
  const reasoningEffort = reasoning.value;
  const tier = readStartChildEffort(candidate.effort);
  if (!tier.ok) return tier;
  const effort = tier.value;

  const provider = trimmedArg(candidate.provider);
  const model = trimmedArg(candidate.model);
  const repoFullName = trimmedArg(candidate.repo_full_name);
  const repoRef = trimmedArg(candidate.repo_ref);

  if (executionScope === "repository" && !repoFullName) {
    return {
      ok: false,
      message:
        "t3team.thread.start_child with execution_scope='repository' requires 'repo_full_name' so the runtime can create a dedicated linked-repository worktree.",
    };
  }
  if (executionScope === "metarepo" && (repoFullName || repoRef)) {
    return {
      ok: false,
      message:
        "t3team.thread.start_child with execution_scope='metarepo' must not include 'repo_full_name' or 'repo_ref'; use execution_scope='repository' with 'repo_full_name' for repository work.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      executionScope,
      ...(ticketId ? { ticketId } : {}),
      ...(kickoffPrompt ? { kickoffPrompt } : {}),
      ...(kickoffMode ? { kickoffMode } : {}),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(effort ? { effort } : {}),
      ...(repoFullName ? { repoFullName } : {}),
      ...(repoRef ? { repoRef } : {}),
    },
  };
};

export const mapKickoffModeToInteractionMode = (
  kickoffMode: T3TeamStartChildKickoffMode | undefined,
): ProviderInteractionMode => (kickoffMode === "plan" ? "plan" : "default");

export {
  buildStartChildModelSelection,
  readModelSelectionReasoningEffort,
} from "./t3team-toolBrokerStartChildModel.ts";
