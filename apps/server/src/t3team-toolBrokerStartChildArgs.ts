import { type ProviderInteractionMode } from "@t3tools/contracts";
import type { AgentEffort } from "@t3team/sdk";

import {
  readStartChildEffort,
  readStartChildReasoningEffort,
  type T3TeamStartChildReasoningEffort,
} from "./t3team-toolBrokerStartChildEffortArgs.ts";

export type T3TeamStartChildKickoffMode = "plan" | "interactive" | "autopilot";
export type { T3TeamStartChildReasoningEffort };
/** Behavior-first isolation choice: 'shared' runs the child in the project's shared checkout;
 * 'own-worktree' gives it a dedicated branch + worktree (of the linked repo named by
 * `repo_full_name`, or of the local repository when the project has no linked repos). */
export type T3TeamStartChildIsolation = "shared" | "own-worktree";

export type T3TeamStartChildArgs = {
  readonly name: string;
  readonly isolation: T3TeamStartChildIsolation;
  /** True when the caller used the deprecated `execution_scope` alias instead of `isolation`. */
  readonly usedLegacyExecutionScope: boolean;
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
   * documented no-op on a provider that exposes neither a reasoning control nor tier models —
   * in which case the launch result carries an explicit `effort_note` instead of downgrading
   * silently.
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
const START_CHILD_ISOLATIONS = new Set<T3TeamStartChildIsolation>(["shared", "own-worktree"]);
/** Maps the deprecated `execution_scope` values onto the behavior-first `isolation` values. */
const LEGACY_EXECUTION_SCOPE_TO_ISOLATION: Readonly<Record<string, T3TeamStartChildIsolation>> = {
  metarepo: "shared",
  repository: "own-worktree",
};

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
    readonly isolation?: unknown;
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
  if (typeof candidate.isolation === "string" && typeof candidate.execution_scope === "string") {
    return {
      ok: false,
      message:
        "t3team.thread.start_child accepts either 'isolation' or the deprecated 'execution_scope', not both. Use 'isolation' with 'shared' or 'own-worktree'.",
    };
  }
  let isolation: T3TeamStartChildIsolation;
  let usedLegacyExecutionScope = false;
  if (typeof candidate.isolation === "string") {
    const normalized = candidate.isolation.trim().toLowerCase() as T3TeamStartChildIsolation;
    if (!START_CHILD_ISOLATIONS.has(normalized)) {
      return {
        ok: false,
        message:
          "t3team.thread.start_child 'isolation' must be exactly 'shared' or 'own-worktree'. Use 'shared' when the child can work in the project's shared checkout (planning, triage, synthesis, read-only review), and 'own-worktree' when it should get its own branch and dedicated worktree (implementation, debugging, tests, PR work).",
      };
    }
    isolation = normalized;
  } else if (typeof candidate.execution_scope === "string") {
    const normalized = candidate.execution_scope.trim().toLowerCase();
    const mapped = LEGACY_EXECUTION_SCOPE_TO_ISOLATION[normalized];
    if (!mapped) {
      return {
        ok: false,
        message:
          "t3team.thread.start_child 'execution_scope' (deprecated) must be exactly 'metarepo' or 'repository'. Prefer 'isolation' with 'shared' or 'own-worktree'.",
      };
    }
    isolation = mapped;
    usedLegacyExecutionScope = true;
  } else {
    return {
      ok: false,
      message:
        "t3team.thread.start_child requires 'isolation' set to 'shared' or 'own-worktree' (or the deprecated 'execution_scope'). 'shared' keeps the child in the shared checkout; 'own-worktree' gives it a dedicated branch + worktree.",
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

  // Whether 'own-worktree' additionally needs 'repo_full_name' depends on the project context
  // (linked-repo manifest present or not), so that check happens in the start-child context,
  // not here.
  if (isolation === "shared" && (repoFullName || repoRef)) {
    return {
      ok: false,
      message:
        "t3team.thread.start_child with isolation='shared' must not include 'repo_full_name' or 'repo_ref'; use isolation='own-worktree' to give the child a dedicated worktree.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      isolation,
      usedLegacyExecutionScope,
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
