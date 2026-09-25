import type {
  ProviderInteractionMode,
  RuntimeMode,
  ThreadEnvironmentBinding,
} from "@t3tools/contracts";
import type { ModelRouting } from "@t3tools/shared/t3team-modelRouting";

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
  /** Cross-environment binding, when the child was started with an explicit `environment`.
   * Absent = same environment as the creating server. */
  readonly environment?: ThreadEnvironmentBinding;
  /** Documents the delivery boundary for a cross-environment child: inter-agent messaging
   * stays same-environment, so report-back needs a separate channel. */
  readonly environmentNote?: string;
  /** Set when a requested provider-agnostic `effort` could not be honored — the launch result
   * says so explicitly instead of silently downgrading. */
  readonly effortNote?: string;
  /** Auto-latest routing record (`NEXI_FF_AUTO_LATEST_MODEL`): requested vs effective slug. */
  readonly modelRouting?: ModelRouting;
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
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.environmentNote ? { environment_note: input.environmentNote } : {}),
    ...(input.interactionMode === "plan"
      ? {
          plan_obligation:
            "kickoff_mode 'plan': this child will stop after presenting its plan and wait " +
            "for your approval — it does not implement on its own. Until you approve it " +
            "reports state 'completed' with the awaitingParent flag in t3team_children " +
            "(op: list or status); send your approval as a follow-up message to that " +
            "child to let it implement.",
        }
      : {}),
    // A routed model is explained by `model_routing`; `model_normalized_from` stays for
    // alias/casing normalization only.
    ...(input.requestedModel && input.requestedModel !== input.model && !input.modelRouting?.routed
      ? { model_normalized_from: input.requestedModel }
      : {}),
    ...(input.modelRouting ? { model_routing: input.modelRouting } : {}),
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
