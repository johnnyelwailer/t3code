import { definePlannedTools, type T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

const PLANNED_WORK_ITEM_GITHUB_THREAD_TOOL_ENTRIES = [
  ...definePlannedTools({
    kind: "read",
    surfaces: ["work-item"],
    ids: [
      "t3team.work_item.attach_context_bundle",
      "t3team.work_item.refresh_context_bundle",
      "t3team.work_item.read_view_state",
      "t3team.work_item.read_description",
      "t3team.work_item.read_attachment",
      "t3team.work_item.reload",
    ],
  }),
  ...definePlannedTools({
    kind: "view-state",
    surfaces: ["work-item"],
    ids: [
      "t3team.work_item.open_related_item",
      "t3team.work_item.focus_section",
      "t3team.work_item.expand_section",
      "t3team.work_item.create_context_bound_thread",
    ],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["my-work", "work-item"],
    ids: [
      "t3team.work_item.assignee.draft_update",
      "t3team.work_item.estimate.draft_update",
      "t3team.work_item.status.draft_update",
    ],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["work-item"],
    ids: [
      "t3team.work_item.description.draft_update",
      "t3team.work_item.comment.draft_create",
      "t3team.work_item.priority.draft_update",
      "t3team.work_item.labels.draft_update",
      "t3team.work_item.link.draft_create",
      "t3team.work_item.attachment.draft_add",
    ],
  }),
  ...definePlannedTools({
    kind: "read",
    surfaces: ["github"],
    ids: [
      "t3team.github.attach_activity_context",
      "t3team.github.refresh_activity_context",
      "t3team.github.list_linked_repositories",
      "t3team.github.list_project_activity",
      "t3team.github.list_work_item_activity",
      "t3team.github.read_pull_request_context",
      "t3team.github.read_pull_request_files",
      "t3team.github.read_pull_request_assets",
      "t3team.github.list_unmatched_activity",
    ],
  }),
  ...definePlannedTools({
    kind: "view-state",
    surfaces: ["github"],
    ids: ["t3team.github.open_activity_item", "t3team.github.attach_activity_to_chat"],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["github"],
    ids: ["t3team.github.link_activity_to_work_item.draft_update"],
  }),
  ...definePlannedTools({
    kind: "read",
    surfaces: ["thread"],
    ids: ["t3team.thread.read_current"],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["thread"],
    ids: ["t3team.thread.rename.draft_update"],
  }),
  ...definePlannedTools({
    kind: "thread",
    surfaces: ["thread"],
    ids: [
      "t3team.thread.create_context_bound",
      "t3team.thread.start_child",
      "t3team.thread.send_cross_thread_message",
      "t3team.thread.attach_context",
      "t3team.thread.open_full_page",
    ],
  }),
] as const;

export const PLANNED_WORK_ITEM_GITHUB_THREAD_T3TEAM_TOOL_CATALOG = Object.fromEntries(
  PLANNED_WORK_ITEM_GITHUB_THREAD_TOOL_ENTRIES.map((tool) => [tool.id, tool]),
) as Readonly<Record<string, T3TeamToolCatalogEntry>>;
