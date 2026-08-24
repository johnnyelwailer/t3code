import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type {
  T3TeamStartChildIsolation,
  T3TeamStartChildKickoffMode,
} from "./t3team-toolBrokerStartChildArgs.ts";

export function buildStartChildResult(input: {
  readonly projectId: string;
  readonly childThreadId: string;
  readonly name: string;
  readonly isolation: T3TeamStartChildIsolation;
  readonly usedLegacyExecutionScope: boolean;
  readonly started: boolean;
  readonly interactionMode: ProviderInteractionMode;
  readonly runtimeMode: RuntimeMode;
  readonly provider: string;
  readonly model: string;
  readonly requestedModel?: string;
  /** Set when a requested provider-agnostic `effort` could not be honored — the launch result
   * says so explicitly instead of silently downgrading. */
  readonly effortNote?: string;
  readonly setupScriptStatus: "not-requested" | "no-script" | "started" | "failed";
  readonly requestedKickoffMode?: T3TeamStartChildKickoffMode;
  readonly reasoningEffort?: string;
  readonly repoFullName: string | null;
  readonly repoRef: string | null;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly setupScriptTerminalId: string | null;
  readonly startupError?: string;
}) {
  return {
    ok: true,
    project_id: input.projectId,
    project_session_id: input.childThreadId,
    name: input.name,
    isolation: input.isolation,
    // Legacy mirror of `isolation` for callers still reading the old field.
    execution_scope: input.isolation === "shared" ? "metarepo" : "repository",
    started: input.started,
    interaction_mode: input.interactionMode,
    runtime_mode: input.runtimeMode,
    provider: input.provider,
    model: input.model,
    ...(input.requestedModel && input.requestedModel !== input.model
      ? { model_normalized_from: input.requestedModel }
      : {}),
    ...(input.effortNote ? { effort_note: input.effortNote } : {}),
    setup_script_status: input.setupScriptStatus,
    navigate_to: { target: "project_session", project_session_id: input.childThreadId },
    ...(input.requestedKickoffMode ? { requested_kickoff_mode: input.requestedKickoffMode } : {}),
    ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
    ...(input.repoFullName ? { repo_full_name: input.repoFullName } : {}),
    ...(input.repoRef ? { repo_ref: input.repoRef } : {}),
    ...(input.branch ? { branch: input.branch } : {}),
    ...(input.worktreePath ? { worktree_path: input.worktreePath } : {}),
    ...(input.setupScriptTerminalId
      ? { setup_script_terminal_id: input.setupScriptTerminalId }
      : {}),
    ...(input.startupError ? { startup_error: input.startupError } : {}),
    ...(input.usedLegacyExecutionScope
      ? {
          deprecation_note:
            "'execution_scope' is deprecated; use 'isolation' ('shared' | 'own-worktree') instead.",
        }
      : {}),
  };
}
