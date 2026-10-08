/**
 * Identity of the threads a workflow launches (`launchThread`). A thread id is derived from the
 * project, the run's launch scope and the author's key, so the same key reaches the same thread
 * on replay, in a later pass, after a restart and in a later run of the same recipe, with no
 * key → id table to keep. The scope is the recipe (its directory name, which is its id) for a
 * recipe run, so a project-local copy of a pack recipe keeps the same threads; a run without a
 * recipe gets its own scope.
 */
import * as NodeCrypto from "node:crypto";

import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

export function workflowLaunchScope(input: {
  readonly runId: string;
  readonly recipePath?: string | null | undefined;
}): string {
  const recipe =
    input.recipePath
      ?.replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() ?? "";
  return recipe.length > 0 ? `recipe:${recipe}` : `run:${input.runId}`;
}

export function launchedThreadIdentity(input: {
  readonly projectId: string;
  readonly scope: string;
  readonly key: string;
}) {
  const digest = NodeCrypto.createHash("sha256")
    .update(`${input.projectId}\0${input.scope}\0${input.key}`)
    .digest("hex")
    .slice(0, 32);
  return {
    threadId: `t3team-launch:${digest}`,
    commandId: `t3team-wf:launch:${digest}`,
  };
}

const RUNTIME_RANK: Record<RuntimeMode, number> = {
  "approval-required": 0,
  "auto-accept-edits": 1,
  auto: 2,
  "full-access": 3,
};
const INTERACTION_RANK: Record<ProviderInteractionMode, number> = { plan: 0, default: 1 };

/** The requested modes, or the reason they exceed the run's (a launched thread never does). */
export function withinRunModes(
  run: { readonly runtimeMode: RuntimeMode; readonly interactionMode: ProviderInteractionMode },
  requested: {
    readonly runtimeMode?: string | undefined;
    readonly interactionMode?: string | undefined;
  },
):
  | { readonly runtimeMode: RuntimeMode; readonly interactionMode: ProviderInteractionMode }
  | { readonly refused: string } {
  const runtimeMode = (requested.runtimeMode ?? run.runtimeMode) as RuntimeMode;
  const interactionMode = (requested.interactionMode ??
    run.interactionMode) as ProviderInteractionMode;
  if (RUNTIME_RANK[runtimeMode] === undefined || INTERACTION_RANK[interactionMode] === undefined) {
    return { refused: `Unknown mode ${runtimeMode}/${interactionMode}.` };
  }
  if (RUNTIME_RANK[runtimeMode] > RUNTIME_RANK[run.runtimeMode]) {
    return { refused: `Runtime mode ${runtimeMode} is above this run's ${run.runtimeMode}.` };
  }
  if (INTERACTION_RANK[interactionMode] > INTERACTION_RANK[run.interactionMode]) {
    return {
      refused: `Interaction mode ${interactionMode} is above this run's ${run.interactionMode}.`,
    };
  }
  return { runtimeMode, interactionMode };
}
