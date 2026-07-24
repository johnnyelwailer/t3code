import { definePlannedTools, type T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

const PLANNED_PROJECT_BACKLOG_MY_WORK_TOOL_ENTRIES = [
  ...definePlannedTools({
    kind: "read",
    surfaces: ["project"],
    ids: [
      "t3team.project.attach_context_bundle",
      "t3team.project.refresh_context_bundle",
      "t3team.project.list_linked_repositories",
    ],
  }),
  ...definePlannedTools({
    kind: "view-state",
    surfaces: ["project"],
    ids: [
      "t3team.project.open_dashboard_mode",
      "t3team.project.open_linked_repository_manager",
      "t3team.project.refresh_integrations",
    ],
  }),
  ...definePlannedTools({
    kind: "thread",
    surfaces: ["project"],
    ids: ["t3team.project.create_context_bound_thread"],
  }),
  ...definePlannedTools({
    kind: "read",
    surfaces: ["backlog"],
    ids: [
      "t3team.backlog.attach_view_context",
      "t3team.backlog.refresh_view_context",
      "t3team.backlog.read_view_state",
      "t3team.backlog.list_visible_items",
      "t3team.backlog.read_hierarchy",
      "t3team.backlog.read_planning_lanes",
      "t3team.backlog.read_ownership_groups",
      "t3team.backlog.read_table_state",
      "t3team.backlog.list_boards",
      "t3team.backlog.list_sprints",
      "t3team.backlog.list_saved_filters",
      "t3team.backlog.search_assignable_users",
      "t3team.backlog.jql.preview",
    ],
  }),
  ...definePlannedTools({
    kind: "view-state",
    surfaces: ["backlog"],
    ids: [
      "t3team.backlog.set_query",
      "t3team.backlog.set_assignee_filter",
      "t3team.backlog.set_saved_filter",
      "t3team.backlog.set_board",
      "t3team.backlog.set_sprint",
      "t3team.backlog.set_view_mode",
      "t3team.backlog.set_focus_filter",
      "t3team.backlog.set_table_grouping",
      "t3team.backlog.set_table_sort",
      "t3team.backlog.set_visible_columns",
      "t3team.backlog.collapse_groups",
      "t3team.backlog.expand_groups",
      "t3team.backlog.refresh",
      "t3team.backlog.open_item",
      "t3team.backlog.jql.open",
    ],
  }),
  ...definePlannedTools({
    kind: "draft-mutation",
    surfaces: ["backlog"],
    ids: [
      "t3team.backlog.item.assignee.draft_update",
      "t3team.backlog.item.estimate.draft_update",
      "t3team.backlog.item.subtask.draft_create",
      "t3team.backlog.saved_filter.draft_create",
    ],
  }),
  ...definePlannedTools({
    kind: "external-convenience",
    surfaces: ["backlog"],
    ids: ["t3team.backlog.saved_filter.create_and_open"],
  }),
  ...definePlannedTools({
    kind: "read",
    surfaces: ["my-work"],
    ids: [
      "t3team.my_work.attach_view_context",
      "t3team.my_work.refresh_view_context",
      "t3team.my_work.read_view_state",
      "t3team.my_work.list_visible_items",
      "t3team.my_work.list_metrics",
      "t3team.my_work.list_kanban_columns",
      "t3team.my_work.read_parent_child_groups",
      "t3team.my_work.list_github_activity",
      "t3team.my_work.list_unmatched_github_activity",
    ],
  }),
  ...definePlannedTools({
    kind: "view-state",
    surfaces: ["my-work"],
    ids: [
      "t3team.my_work.set_query",
      "t3team.my_work.set_view_mode",
      "t3team.my_work.set_group_mode",
      "t3team.my_work.set_status_category",
      "t3team.my_work.set_show_jira_items",
      "t3team.my_work.set_show_github_activity",
      "t3team.my_work.set_type_filter",
      "t3team.my_work.set_priority_filter",
      "t3team.my_work.set_exact_status_filter",
      "t3team.my_work.reset_advanced_filters",
      "t3team.my_work.open_item",
    ],
  }),
] as const;

export const PLANNED_PROJECT_BACKLOG_MY_WORK_T3TEAM_TOOL_CATALOG = Object.fromEntries(
  PLANNED_PROJECT_BACKLOG_MY_WORK_TOOL_ENTRIES.map((tool) => [tool.id, tool]),
) as Readonly<Record<string, T3TeamToolCatalogEntry>>;
