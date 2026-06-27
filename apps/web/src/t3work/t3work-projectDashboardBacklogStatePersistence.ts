import {
  parseProjectBacklogAssigneeFilterScope,
  parseProjectBacklogAssigneeFilterScopeRouteValue,
  parseProjectBacklogVisibleIssueTypes,
  parseProjectBacklogVisibleIssueTypesRouteValue,
  PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
  serializeProjectBacklogAssigneeFilterScopeRouteValue,
  serializeProjectBacklogVisibleIssueTypesRouteValue,
  areProjectBacklogAssigneeFilterScopesEqual,
} from "./t3work-projectBacklogUtils";

import {
  ALL_JIRA_FILTERS_ROUTE_SEARCH_VALUE,
  ALL_SPRINTS_ROUTE_SEARCH_VALUE,
  createDefaultProjectDashboardBacklogState,
  EMPTY_BOARD_ROUTE_SEARCH_VALUE,
  getProjectDashboardBacklogStorageKey,
  parsePersistedSelection,
  parseRouteEnum,
  parseVisibleProjectBacklogTableColumns,
  projectBacklogFocusFilterValues,
  projectBacklogTableGroupByValues,
  projectBacklogTableSortByValues,
  projectBacklogTableSortDirectionValues,
  projectBacklogViewModeValues,
  routeSearchKeys,
  type PersistedProjectDashboardBacklogState,
  type ProjectDashboardBacklogRouteSearch,
  type ProjectDashboardBacklogState,
} from "./t3work-projectDashboardBacklogStateShared";

export function readPersistedProjectDashboardBacklogState(
  projectId: string,
): PersistedProjectDashboardBacklogState | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getProjectDashboardBacklogStorageKey(projectId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const persisted: PersistedProjectDashboardBacklogState = {};

    if (typeof parsed.query === "string") persisted.query = parsed.query;

    const focusFilter = parseRouteEnum(parsed.focusFilter, projectBacklogFocusFilterValues);
    if (focusFilter !== undefined) persisted.focusFilter = focusFilter;

    if (typeof parsed.assigneeFilter === "string") persisted.assigneeFilter = parsed.assigneeFilter;

    if (parsed.assigneeFilterScope !== undefined) {
      persisted.assigneeFilterScope = parseProjectBacklogAssigneeFilterScope(
        parsed.assigneeFilterScope,
      );
    }

    const visibleIssueTypes = parseProjectBacklogVisibleIssueTypes(parsed.visibleIssueTypes);
    if (visibleIssueTypes !== undefined) persisted.visibleIssueTypes = visibleIssueTypes;

    const viewMode = parseRouteEnum(parsed.viewMode, projectBacklogViewModeValues);
    if (viewMode !== undefined) persisted.viewMode = viewMode;

    const tableGroupBy = parseRouteEnum(parsed.tableGroupBy, projectBacklogTableGroupByValues);
    if (tableGroupBy !== undefined) persisted.tableGroupBy = tableGroupBy;

    const tableSortBy = parseRouteEnum(parsed.tableSortBy, projectBacklogTableSortByValues);
    if (tableSortBy !== undefined) persisted.tableSortBy = tableSortBy;

    const tableSortDirection = parseRouteEnum(
      parsed.tableSortDirection,
      projectBacklogTableSortDirectionValues,
    );
    if (tableSortDirection !== undefined) persisted.tableSortDirection = tableSortDirection;

    const visibleTableColumns = parseVisibleProjectBacklogTableColumns(parsed.visibleTableColumns);
    if (visibleTableColumns !== undefined) persisted.visibleTableColumns = visibleTableColumns;

    const boardId = parsePersistedSelection(parsed.boardId);
    if (boardId !== undefined) persisted.boardId = boardId;

    const sprintId = parsePersistedSelection(parsed.sprintId);
    if (sprintId !== undefined) persisted.sprintId = sprintId;

    const filterId = parsePersistedSelection(parsed.filterId);
    if (filterId !== undefined) persisted.filterId = filterId;

    return persisted;
  } catch {
    return null;
  }
}

export function writePersistedProjectDashboardBacklogState(
  projectId: string,
  state: ProjectDashboardBacklogState,
): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getProjectDashboardBacklogStorageKey(projectId),
    JSON.stringify(state),
  );
}

export function resolveProjectDashboardBacklogState(input: {
  persisted?: PersistedProjectDashboardBacklogState | null;
  search?: ProjectDashboardBacklogRouteSearch | null;
}): ProjectDashboardBacklogState {
  const next: ProjectDashboardBacklogState = {
    ...createDefaultProjectDashboardBacklogState(),
    ...input.persisted,
  };

  const visibleTableColumns = parseVisibleProjectBacklogTableColumns(
    input.persisted?.visibleTableColumns,
  );
  if (visibleTableColumns !== undefined) {
    next.visibleTableColumns = visibleTableColumns;
  }

  const search = input.search;
  if (!search) return next;

  if ("q" in search) next.query = search.q ?? "";
  if (search.focus !== undefined) next.focusFilter = search.focus;
  if ("assignee" in search)
    next.assigneeFilter = search.assignee ?? PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL;
  const routeAssigneeScope = parseProjectBacklogAssigneeFilterScopeRouteValue(search.assigneeScope);
  if (routeAssigneeScope !== undefined) {
    next.assigneeFilterScope = routeAssigneeScope;
  }
  const routeVisibleIssueTypes = parseProjectBacklogVisibleIssueTypesRouteValue(search.issueTypes);
  if (routeVisibleIssueTypes !== undefined) {
    next.visibleIssueTypes = routeVisibleIssueTypes;
  }
  if (search.view !== undefined) next.viewMode = search.view;
  if (search.group !== undefined) next.tableGroupBy = search.group;
  if (search.sort !== undefined) next.tableSortBy = search.sort;
  if (search.dir !== undefined) next.tableSortDirection = search.dir;
  if ("board" in search) {
    next.boardId =
      search.board && search.board !== EMPTY_BOARD_ROUTE_SEARCH_VALUE ? search.board : undefined;
  }
  if ("sprint" in search) {
    next.sprintId =
      search.sprint && search.sprint !== ALL_SPRINTS_ROUTE_SEARCH_VALUE ? search.sprint : undefined;
  }
  if ("jiraFilter" in search) {
    next.filterId =
      search.jiraFilter && search.jiraFilter !== ALL_JIRA_FILTERS_ROUTE_SEARCH_VALUE
        ? search.jiraFilter
        : undefined;
  }

  return next;
}

export function buildProjectDashboardBacklogRouteSearch(
  state: ProjectDashboardBacklogState,
): ProjectDashboardBacklogRouteSearch {
  const assigneeScope = serializeProjectBacklogAssigneeFilterScopeRouteValue(
    state.assigneeFilterScope,
  );
  const issueTypes = serializeProjectBacklogVisibleIssueTypesRouteValue(state.visibleIssueTypes);

  return {
    q: state.query,
    focus: state.focusFilter,
    assignee: state.assigneeFilter,
    ...(assigneeScope !== undefined ? { assigneeScope } : {}),
    ...(issueTypes !== undefined ? { issueTypes } : {}),
    view: state.viewMode,
    group: state.tableGroupBy,
    sort: state.tableSortBy,
    dir: state.tableSortDirection,
    board: state.boardId ?? EMPTY_BOARD_ROUTE_SEARCH_VALUE,
    sprint: state.sprintId ?? ALL_SPRINTS_ROUTE_SEARCH_VALUE,
    jiraFilter: state.filterId ?? ALL_JIRA_FILTERS_ROUTE_SEARCH_VALUE,
  };
}

export function stripProjectDashboardBacklogSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, (typeof routeSearchKeys)[number]> {
  const next = { ...params } as Record<string, unknown>;
  for (const key of routeSearchKeys) {
    delete next[key];
  }
  return next as Omit<T, (typeof routeSearchKeys)[number]>;
}

export {
  areProjectDashboardBacklogRouteSearchEqual,
  areProjectDashboardBacklogStatesEqual,
} from "./t3work-projectDashboardBacklogStateEquality";
