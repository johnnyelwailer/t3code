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
  "Tools that read or write project-local t3team artifacts and context bundles.",
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
  "t3team.backlog.set_assignee_filter": PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
  "t3team.view.read": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.project.list_linked_repositories": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.project.open_dashboard_mode": PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
  "t3team.project.attach_context_bundle": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3team.project.refresh_context_bundle": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3team.project.create_context_bound_thread": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3team.work_item.read_view_state": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.work_item.attach_context_bundle": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3team.work_item.refresh_context_bundle": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3team.backlog.item.assignee.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.backlog.item.estimate.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.backlog.item.subtask.draft_create": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.work_item.assignee.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.work_item.estimate.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.work_item.status.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.work_item.description.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.work_item.comment.draft_create": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.work_item.create_context_bound_thread": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3team.github.read_pull_request_context": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.github.read_pull_request_files": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.github.read_pull_request_assets": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.github.attach_activity_context": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3team.github.refresh_activity_context": PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP.id,
  "t3team.github.issue_comment.draft_create": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.recipe.list": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.orchestration.run": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  // Same group as `run`: a recipe that declares `thread.handoff` to launch an ephemeral
  // orchestration must be able to observe and recover it too, or the agent is blind the moment
  // a run goes async. `resume` carries the same risk as `run` itself (it can execute further
  // arbitrary orchestration code, optionally with a corrected `source`) — a caller that already
  // holds `thread.handoff` could reach the same effect via `run` again, so a narrower group for
  // `resume` alone would not reduce the actual blast radius, only add friction to the intended
  // run -> observe -> fix -> resume recovery loop (see t3team-workflowManual.ts).
  "t3team.orchestration.status": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3team.orchestration.resume": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3team.recipe.validate": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.thread.read_current": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.thread.rename": PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
  "t3team.thread.search": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.thread.search_source": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.thread.read_message": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.thread.rename.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.thread.create_context_bound": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3team.thread.start_child": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3team.thread.children": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3team.widget.show": PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
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
