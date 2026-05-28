import { definePlannedTools, type T3workToolCatalogEntry } from "./t3work-toolCatalogCore.js";

const PLANNED_WORK_ITEM_GITHUB_THREAD_TOOL_ENTRIES = [
  ...definePlannedTools({
    kind: "read",
    surfaces: ["work-item"],
    ids: [
      "t3work.work_item.attach_context_bundle",
      "t3work.work_item.refresh_context_bundle",
      "t3work.work_item.read_view_state",
      "t3work.work_item.read_description",
      "t3work.work_item.read_attachment",
      "t3work.work_item.reload",
    ],
  }),
  ...definePlannedTools({
    kind: "view-state",
    surfaces: ["work-item"],
    ids: [
      "t3work.work_item.open_related_item",
      "t3work.work_item.focus_section",
      "t3work.work_item.expand_section",
      "t3work.work_item.create_context_bound_thread",
    ],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["my-work", "work-item"],
    ids: [
      "t3work.work_item.assignee.draft_update",
      "t3work.work_item.estimate.draft_update",
      "t3work.work_item.status.draft_update",
    ],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["work-item"],
    ids: [
      "t3work.work_item.description.draft_update",
      "t3work.work_item.comment.draft_create",
      "t3work.work_item.priority.draft_update",
      "t3work.work_item.labels.draft_update",
      "t3work.work_item.link.draft_create",
      "t3work.work_item.attachment.draft_add",
    ],
  }),
  ...definePlannedTools({
    kind: "read",
    surfaces: ["github"],
    ids: [
      "t3work.github.attach_activity_context",
      "t3work.github.refresh_activity_context",
      "t3work.github.list_linked_repositories",
      "t3work.github.list_project_activity",
      "t3work.github.list_work_item_activity",
      "t3work.github.read_pull_request_overview",
      "t3work.github.read_pull_request_activity",
      "t3work.github.read_pull_request_checks",
      "t3work.github.read_pull_request_file_tree",
      "t3work.github.read_pull_request_diff_manifest",
      "t3work.github.read_pull_request_diff_chunk",
      "t3work.github.read_pull_request_selection_context",
      "t3work.github.read_review_thread",
      "t3work.github.read_check_run_details",
      "t3work.github.read_pull_request_context",
      "t3work.github.read_pull_request_files",
      "t3work.github.read_pull_request_assets",
      "t3work.github.list_unmatched_activity",
    ],
  }),
  ...definePlannedTools({
    kind: "view-state",
    surfaces: ["github"],
    ids: [
      "t3work.github.open_activity_item",
      "t3work.github.attach_activity_to_chat",
      "t3work.github.open_pull_request",
      "t3work.github.select_pull_request_item",
      "t3work.github.set_pull_request_activity_filters",
      "t3work.github.set_pull_request_diff_filters",
      "t3work.github.attach_pull_request_selection_to_chat",
      "t3work.github.start_child_from_pull_request_selection",
    ],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["github"],
    ids: [
      "t3work.github.link_activity_to_work_item.draft_update",
      "t3work.github.issue_comment.draft_create",
      "t3work.github.review_comment.draft_create",
      "t3work.github.review_reply.draft_create",
      "t3work.github.review_summary.draft_create",
      "t3work.github.reviewers.draft_update",
    ],
  }),
  ...definePlannedTools({
    kind: "read",
    surfaces: ["thread"],
    ids: ["t3work.thread.read_current"],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["thread"],
    ids: ["t3work.thread.rename.draft_update"],
  }),
  ...definePlannedTools({
    kind: "thread",
    surfaces: ["thread"],
    ids: [
      "t3work.thread.create_context_bound",
      "t3work.thread.start_child",
      "t3work.thread.send_cross_thread_message",
      "t3work.thread.attach_context",
      "t3work.thread.open_full_page",
    ],
  }),
] as const;

export const PLANNED_WORK_ITEM_GITHUB_THREAD_T3WORK_TOOL_CATALOG = Object.fromEntries(
  PLANNED_WORK_ITEM_GITHUB_THREAD_TOOL_ENTRIES.map((tool) => [tool.id, tool]),
) as Readonly<Record<string, T3workToolCatalogEntry>>;
