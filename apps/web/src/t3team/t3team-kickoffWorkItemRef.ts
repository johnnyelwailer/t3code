import type { T3TeamSidecarRecipeInput } from "~/t3team/t3team-sidecarRecipeTypes";

/**
 * The work item a kickoff surface is targeting, reduced to a reference the launch can hand the
 * server: the tracker key plus the provider and t3team project it lives in.
 *
 * `undefined` when the surface is not actually pointing at a work item — on the dashboard the
 * selected label falls back to the project title, so only an explicit `ticket` resource kind
 * counts as a real work item.
 */
export type T3TeamKickoffWorkItemRef = {
  readonly key: string;
  readonly provider: string;
  readonly project: string;
};

export function buildT3TeamKickoffWorkItemRef(
  input: Pick<T3TeamSidecarRecipeInput, "resourceKind" | "selectedWorkLabel" | "project">,
): T3TeamKickoffWorkItemRef | undefined {
  if (input.resourceKind !== "ticket") {
    return undefined;
  }
  const key = input.selectedWorkLabel.trim();
  if (key.length === 0) {
    return undefined;
  }
  return {
    key,
    provider: input.project.source.provider,
    project: input.project.id,
  };
}

/**
 * The workflow `parameters` the selected work item contributes to the launch. `issueIdOrKey` is the
 * shape work-item recipes already read from `getArgs()`; `workItem` carries the full reference
 * (key + provider + project) for recipes that want the provider/project.
 */
export function buildT3TeamKickoffWorkItemParameters(
  workItem: T3TeamKickoffWorkItemRef | undefined,
): Record<string, unknown> {
  if (!workItem) {
    return {};
  }
  return {
    issueIdOrKey: workItem.key,
    workItem: {
      key: workItem.key,
      provider: workItem.provider,
      project: workItem.project,
    },
  };
}
