import {
  PROJECT_RECIPE_PRELAUNCH_TOOL_GROUP_IDS,
  getProjectRecipeToolGroupForToolId,
  normalizeProjectRecipeToolGroups,
  type ProjectRecipeToolGroupId,
} from "@t3tools/project-recipes";

function formatAllowedToolGroups(groups: ReadonlyArray<ProjectRecipeToolGroupId>): string {
  return `[${groups.map((group) => `'${group}'`).join(", ")}]`;
}

export function buildBindingState(input: {
  readonly availableToolIds: ReadonlyArray<string>;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly prelaunchOnly?: boolean;
}) {
  const normalizedGroups = normalizeProjectRecipeToolGroups(input.allowedToolGroups);
  const effectiveGroups =
    normalizedGroups === undefined
      ? undefined
      : input.prelaunchOnly
        ? normalizedGroups.filter((group) =>
            PROJECT_RECIPE_PRELAUNCH_TOOL_GROUP_IDS.some((candidate) => candidate === group),
          )
        : normalizedGroups;
  const availableToolIds = [...new Set(input.availableToolIds)];
  const availableToolIdSet = new Set(availableToolIds);
  const allowedToolIds =
    effectiveGroups === undefined
      ? availableToolIds
      : availableToolIds.filter((toolId) => {
          const group = getProjectRecipeToolGroupForToolId(toolId);
          return group !== undefined && effectiveGroups.includes(group);
        });
  const allowedToolIdSet = new Set(allowedToolIds);

  return { availableToolIdSet, allowedToolIds, allowedToolIdSet, effectiveGroups };
}

export type BindingState = ReturnType<typeof buildBindingState>;

export function permissionMessage(
  toolId: string,
  effectiveGroups: ReadonlyArray<ProjectRecipeToolGroupId>,
): string {
  const requiredGroup = getProjectRecipeToolGroupForToolId(toolId);
  return requiredGroup
    ? `Tool '${toolId}' requires group '${requiredGroup}' but recipe declares only ${formatAllowedToolGroups(effectiveGroups)}.`
    : `Tool '${toolId}' is not classified in the recipe tool-group registry.`;
}
