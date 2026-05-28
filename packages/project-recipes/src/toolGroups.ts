type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ProjectRecipeToolGroupId = Brand<string, "ProjectRecipeToolGroupId">;
export type ProjectRecipeToolClass =
  | "read"
  | "view-state"
  | "draft-mutation"
  | "external-convenience";

type ProjectRecipeToolGroup = {
  readonly id: ProjectRecipeToolGroupId;
  readonly toolClass: ProjectRecipeToolClass;
  readonly description: string;
  readonly readOnly: boolean;
};

const defineToolGroup = <const Id extends string>(
  id: Id,
  toolClass: ProjectRecipeToolClass,
  description: string,
  readOnly: boolean,
) =>
  ({
    id: id as Id & ProjectRecipeToolGroupId,
    toolClass,
    description,
    readOnly,
  }) satisfies ProjectRecipeToolGroup;

export const PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP = defineToolGroup(
  "integration.read",
  "read",
  "Read tools bound to the current integration or visible context.",
  true,
);
export const PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP = defineToolGroup(
  "view.state",
  "view-state",
  "Tools that update local visible state such as the current route or thread title.",
  false,
);
export const PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP = defineToolGroup(
  "artifact.rw",
  "draft-mutation",
  "Tools that read or write project-local t3work artifacts and context bundles.",
  false,
);
export const PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP = defineToolGroup(
  "mutation.draft",
  "draft-mutation",
  "Tools that prepare visible drafts while leaving final commits to the user.",
  false,
);
export const PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP = defineToolGroup(
  "thread.handoff",
  "external-convenience",
  "Tools that create child sessions or other visible handoff flows.",
  false,
);
export const PROJECT_RECIPE_UI_RENDER_TOOL_GROUP = defineToolGroup(
  "ui.render",
  "read",
  "Pre-launch rendering helpers. The MVP registry intentionally leaves this empty.",
  true,
);

export const PROJECT_RECIPE_TOOL_GROUPS = [
  PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP,
  PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP,
  PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP,
  PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP,
  PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP,
  PROJECT_RECIPE_UI_RENDER_TOOL_GROUP,
] as const;

export const PROJECT_RECIPE_PRELAUNCH_TOOL_GROUP_IDS = [
  PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  PROJECT_RECIPE_UI_RENDER_TOOL_GROUP.id,
] as const;

export const PROJECT_RECIPE_TOOL_GROUPS_BY_ID = Object.fromEntries(
  PROJECT_RECIPE_TOOL_GROUPS.map((group) => [group.id, group]),
) as Readonly<Record<ProjectRecipeToolGroupId, ProjectRecipeToolGroup>>;

export const PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID = {
  "t3work.backlog.set_assignee_filter": PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
  "t3work.view.read": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3work.project.list_linked_repositories": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3work.project.open_dashboard_mode": PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
  "t3work.project.attach_context_bundle": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3work.project.refresh_context_bundle": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3work.project.create_context_bound_thread": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3work.work_item.read_view_state": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3work.work_item.attach_context_bundle": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3work.work_item.refresh_context_bundle": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3work.work_item.assignee.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3work.work_item.create_context_bound_thread": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3work.github.read_pull_request_context": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3work.github.read_pull_request_files": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3work.github.read_pull_request_assets": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3work.github.attach_activity_context": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3work.github.refresh_activity_context": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3work.github.issue_comment.draft_create": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3work.thread.read_current": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3work.thread.rename": PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
  "t3work.thread.rename.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3work.thread.create_context_bound": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3work.thread.start_child": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
} as const satisfies Readonly<Record<string, ProjectRecipeToolGroupId>>;

export function isProjectRecipeToolGroupId(value: string): value is ProjectRecipeToolGroupId {
  return value in PROJECT_RECIPE_TOOL_GROUPS_BY_ID;
}

export function getProjectRecipeToolGroupForToolId(
  toolId: string,
): ProjectRecipeToolGroupId | undefined {
  return PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID[
    toolId as keyof typeof PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID
  ];
}

export function normalizeProjectRecipeToolGroups(
  value: ReadonlyArray<string> | undefined,
): ReadonlyArray<ProjectRecipeToolGroupId> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return [...new Set(value.filter(isProjectRecipeToolGroupId))];
}
