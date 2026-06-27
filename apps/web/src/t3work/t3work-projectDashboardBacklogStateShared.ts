import type { BacklogSelectionInput } from "./hooks/t3work-projectBacklogCache";
import {
  projectBacklogViewModes,
  type ProjectBacklogViewMode,
} from "./t3work-projectBacklogPresentation";
import type {
  ProjectBacklogTableColumnId,
  ProjectBacklogTableGroupBy,
  ProjectBacklogTableSortBy,
  ProjectBacklogTableSortDirection,
} from "./t3work-projectBacklogTable";
import {
  defaultProjectBacklogTableVisibleColumns,
  projectBacklogTableColumnValues,
} from "./t3work-projectBacklogTable";
import {
  defaultProjectBacklogAssigneeFilterScope,
  defaultProjectBacklogVisibleIssueTypes,
  PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
  type ProjectBacklogAssigneeFilterScope,
  type ProjectBacklogFocusFilter,
  type ProjectBacklogIssueTypeFilterKey,
} from "./t3work-projectBacklogUtils";

export interface ProjectDashboardBacklogRouteSearch {
  q?: string;
  focus?: ProjectBacklogFocusFilter;
  assignee?: string;
  assigneeScope?: string;
  issueTypes?: string;
  view?: ProjectBacklogViewMode;
  group?: ProjectBacklogTableGroupBy;
  sort?: ProjectBacklogTableSortBy;
  dir?: ProjectBacklogTableSortDirection;
  board?: string;
  sprint?: string;
  jiraFilter?: string;
}

export interface ProjectDashboardBacklogState extends BacklogSelectionInput {
  query: string;
  focusFilter: ProjectBacklogFocusFilter;
  assigneeFilter: string;
  assigneeFilterScope: ProjectBacklogAssigneeFilterScope;
  visibleIssueTypes: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>;
  viewMode: ProjectBacklogViewMode;
  tableGroupBy: ProjectBacklogTableGroupBy;
  tableSortBy: ProjectBacklogTableSortBy;
  tableSortDirection: ProjectBacklogTableSortDirection;
  visibleTableColumns: ReadonlyArray<ProjectBacklogTableColumnId>;
}

export type PersistedProjectDashboardBacklogState = Partial<ProjectDashboardBacklogState>;

export const EMPTY_BOARD_ROUTE_SEARCH_VALUE = "__no_board__";
export const ALL_SPRINTS_ROUTE_SEARCH_VALUE = "__all_sprints__";
export const ALL_JIRA_FILTERS_ROUTE_SEARCH_VALUE = "__all_saved_filters__";

export const projectBacklogFocusFilterValues = new Set<ProjectBacklogFocusFilter>([
  "all",
  "needs-plan",
  "unassigned",
  "with-subtasks",
]);
export const projectBacklogViewModeValues = new Set<ProjectBacklogViewMode>([
  "hierarchy",
  "planning",
  "ownership",
  "table",
  "planning-space",
]);
export const projectBacklogTableGroupByValues = new Set<ProjectBacklogTableGroupBy>([
  "none",
  "planning-state",
  "sprint",
  "assignee",
  "status",
  "issue-type",
  "parent",
]);
export const projectBacklogTableSortByValues = new Set<ProjectBacklogTableSortBy>([
  "rank",
  "updated",
  "estimate",
  "key",
  "title",
  "status",
  "assignee",
]);
export const projectBacklogTableSortDirectionValues = new Set<ProjectBacklogTableSortDirection>([
  "asc",
  "desc",
]);

export function parseVisibleProjectBacklogTableColumns(
  value: unknown,
): ReadonlyArray<ProjectBacklogTableColumnId> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.filter(
    (column): column is ProjectBacklogTableColumnId =>
      typeof column === "string" &&
      projectBacklogTableColumnValues.has(column as ProjectBacklogTableColumnId),
  );

  const deduped = [...new Set(parsed)];
  return deduped.length > 0 ? deduped : undefined;
}

export const routeSearchKeys = [
  "q",
  "focus",
  "assignee",
  "assigneeScope",
  "issueTypes",
  "view",
  "group",
  "sort",
  "dir",
  "board",
  "sprint",
  "jiraFilter",
] as const;

export { parseProjectDashboardBacklogRouteSearch } from "./t3work-projectDashboardBacklogRouteSearchParse";
export {
  parsePersistedSelection,
  parseRouteEnum,
} from "./t3work-projectDashboardBacklogStateRouteUtils";

export function createDefaultProjectDashboardBacklogState(): ProjectDashboardBacklogState {
  return {
    query: "",
    focusFilter: "all",
    assigneeFilter: PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
    assigneeFilterScope: { ...defaultProjectBacklogAssigneeFilterScope },
    visibleIssueTypes: [...defaultProjectBacklogVisibleIssueTypes],
    viewMode: projectBacklogViewModes[0]?.value ?? "table",
    tableGroupBy: "planning-state",
    tableSortBy: "rank",
    tableSortDirection: "desc",
    visibleTableColumns: [...defaultProjectBacklogTableVisibleColumns],
  };
}

export function getProjectDashboardBacklogStorageKey(projectId: string): string {
  return `t3work:project-backlog-state:v1:${projectId}`;
}
