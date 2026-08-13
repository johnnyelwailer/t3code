type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ProjectRecipeToolGroupId = Brand<string, "ProjectRecipeToolGroupId">;
/**
 * `"execute"` is a NEW class, not a reuse of `"draft-mutation"` or `"external-convenience"`: every
 * existing class ends in something reversible or user-mediated — a read touches nothing, a
 * view-state change is local UI state, a draft-mutation is a draft the user still has to commit,
 * and external-convenience only creates a child session or handoff. Running an arbitrary command
 * against a real checkout has none of that: the command's effects (inside its sandbox) happen
 * immediately and are whatever the command does, not a diff the user reviews first. That is a
 * categorically different risk shape, so it gets its own class rather than being folded into one
 * of the above and understating what approving it actually authorizes.
 */
export type ProjectRecipeToolClass =
  | "read"
  | "view-state"
  | "draft-mutation"
  | "external-convenience"
  | "execute";

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
export const PROJECT_RECIPE_SANDBOX_EXECUTE_TOOL_GROUP = defineToolGroup(
  "sandbox.execute",
  "execute",
  "Tools that check out a git ref into an isolated sandbox and run a command against it, such as the test suite or the app itself.",
  false,
);

export const PROJECT_RECIPE_TOOL_GROUPS = [
  PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP,
  PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP,
  PROJECT_RECIPE_ARTIFACT_RW_TOOL_GROUP,
  PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP,
  PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP,
  PROJECT_RECIPE_UI_RENDER_TOOL_GROUP,
  PROJECT_RECIPE_SANDBOX_EXECUTE_TOOL_GROUP,
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
  "t3team.sandbox.run": PROJECT_RECIPE_SANDBOX_EXECUTE_TOOL_GROUP.id,
  "t3team.recipe.validate": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.thread.read_current": PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
  "t3team.thread.rename": PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
  "t3team.thread.rename.draft_update": PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  "t3team.thread.create_context_bound": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
  "t3team.thread.start_child": PROJECT_RECIPE_THREAD_HANDOFF_TOOL_GROUP.id,
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
