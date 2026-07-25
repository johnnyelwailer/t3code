import {
  createDefaultProjectDashboardMyWorkState,
  parsePersistedStringList,
  parseRouteEnum,
  parseRouteStringList,
  projectDashboardMyWorkRouteSearchKeys,
  projectMyWorkGroupModeValues,
  projectMyWorkKanbanLaneSelectionModeValues,
  projectMyWorkStatusCategoryValues,
  projectMyWorkTableSortByValues,
  projectMyWorkTableSortDirectionValues,
  projectMyWorkViewModeValues,
  type PersistedProjectDashboardMyWorkState,
  type ProjectDashboardMyWorkRouteSearch,
  type ProjectDashboardMyWorkState,
} from "./t3team-projectDashboardMyWorkStateShared";

export function readPersistedProjectDashboardMyWorkState(
  storageKey: string,
): PersistedProjectDashboardMyWorkState | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const persisted: PersistedProjectDashboardMyWorkState = {};

    if (typeof parsed.query === "string") persisted.query = parsed.query;

    const viewMode = parseRouteEnum(parsed.viewMode, projectMyWorkViewModeValues);
    if (viewMode !== undefined) persisted.viewMode = viewMode;

    const groupMode = parseRouteEnum(parsed.groupMode, projectMyWorkGroupModeValues);
    if (groupMode !== undefined) persisted.groupMode = groupMode;

    const statusCategory = parseRouteEnum(parsed.statusCategory, projectMyWorkStatusCategoryValues);
    if (statusCategory !== undefined) persisted.statusCategory = statusCategory;

    if (typeof parsed.showGitHubActivity === "boolean") {
      persisted.showGitHubActivity = parsed.showGitHubActivity;
    }

    const hiddenKanbanColumnIds = parsePersistedStringList(parsed.hiddenKanbanColumnIds);
    if (hiddenKanbanColumnIds !== undefined) {
      persisted.hiddenKanbanColumnIds = hiddenKanbanColumnIds;
      if (hiddenKanbanColumnIds.length > 0) {
        persisted.hasCustomizedKanbanLanes = true;
      }
    }

    if (typeof parsed.hasCustomizedKanbanLanes === "boolean") {
      persisted.hasCustomizedKanbanLanes = parsed.hasCustomizedKanbanLanes;
    }

    const excludedTypeKeys = parsePersistedStringList(parsed.excludedTypeKeys);
    if (excludedTypeKeys !== undefined) persisted.excludedTypeKeys = excludedTypeKeys;

    if (typeof parsed.selectedPriority === "string") {
      persisted.selectedPriority = parsed.selectedPriority;
    }

    if (typeof parsed.selectedStatus === "string") {
      persisted.selectedStatus = parsed.selectedStatus;
    }

    const tableSortBy = parseRouteEnum(parsed.tableSortBy, projectMyWorkTableSortByValues);
    if (tableSortBy !== undefined) persisted.tableSortBy = tableSortBy;

    const tableSortDirection = parseRouteEnum(
      parsed.tableSortDirection,
      projectMyWorkTableSortDirectionValues,
    );
    if (tableSortDirection !== undefined) persisted.tableSortDirection = tableSortDirection;

    return persisted;
  } catch {
    return null;
  }
}

export function writePersistedProjectDashboardMyWorkState(
  storageKey: string,
  state: ProjectDashboardMyWorkState,
): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function resolveProjectDashboardMyWorkState(input: {
  persisted?: PersistedProjectDashboardMyWorkState | null;
  search?: ProjectDashboardMyWorkRouteSearch | null;
}): ProjectDashboardMyWorkState {
  const next: ProjectDashboardMyWorkState = {
    ...createDefaultProjectDashboardMyWorkState(),
    ...input.persisted,
  };

  const search = input.search;
  if (!search) {
    return next;
  }

  if (search.myWorkQ !== undefined) next.query = search.myWorkQ;
  if (search.myWorkView !== undefined) next.viewMode = search.myWorkView;
  if (search.myWorkGroup !== undefined) next.groupMode = search.myWorkGroup;
  if (search.myWorkStatus !== undefined) next.statusCategory = search.myWorkStatus;
  if (search.myWorkGitHub !== undefined) next.showGitHubActivity = search.myWorkGitHub === "show";
  const kanbanLaneSelectionMode = parseRouteEnum(
    search.myWorkLanesMode,
    projectMyWorkKanbanLaneSelectionModeValues,
  );
  if (kanbanLaneSelectionMode !== undefined) {
    next.hasCustomizedKanbanLanes = kanbanLaneSelectionMode === "custom";
  }
  const hiddenKanbanColumnIds = parseRouteStringList(search.myWorkLanes);
  if (hiddenKanbanColumnIds !== undefined) {
    next.hiddenKanbanColumnIds = hiddenKanbanColumnIds;
    if (
      kanbanLaneSelectionMode === undefined &&
      typeof search.myWorkLanes === "string" &&
      search.myWorkLanes.trim().length > 0
    ) {
      next.hasCustomizedKanbanLanes = true;
    }
  }
  if (search.myWorkPriority !== undefined) next.selectedPriority = search.myWorkPriority;
  if (search.myWorkTicketStatus !== undefined) next.selectedStatus = search.myWorkTicketStatus;
  const routeTypeKeys = parseRouteStringList(search.myWorkTypes);
  if (routeTypeKeys !== undefined) next.excludedTypeKeys = routeTypeKeys;
  if (search.myWorkSort !== undefined) next.tableSortBy = search.myWorkSort;
  if (search.myWorkDir !== undefined) next.tableSortDirection = search.myWorkDir;

  return next;
}

export function buildProjectDashboardMyWorkRouteSearch(
  state: ProjectDashboardMyWorkState,
): ProjectDashboardMyWorkRouteSearch {
  return {
    myWorkQ: state.query,
    myWorkView: state.viewMode,
    myWorkGroup: state.groupMode,
    myWorkStatus: state.statusCategory,
    myWorkGitHub: state.showGitHubActivity ? "show" : "hide",
    ...(state.hasCustomizedKanbanLanes
      ? {
          myWorkLanesMode: "custom" as const,
          myWorkLanes: state.hiddenKanbanColumnIds.join(","),
        }
      : {}),
    myWorkPriority: state.selectedPriority,
    myWorkTicketStatus: state.selectedStatus,
    myWorkTypes: state.excludedTypeKeys.join(","),
    myWorkSort: state.tableSortBy,
    myWorkDir: state.tableSortDirection,
  };
}

export function stripProjectDashboardMyWorkSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, (typeof projectDashboardMyWorkRouteSearchKeys)[number]> {
  const next = { ...params } as Record<string, unknown>;
  for (const key of projectDashboardMyWorkRouteSearchKeys) {
    delete next[key];
  }
  return next as Omit<T, (typeof projectDashboardMyWorkRouteSearchKeys)[number]>;
}

export function areProjectDashboardMyWorkStatesEqual(
  left: ProjectDashboardMyWorkState,
  right: ProjectDashboardMyWorkState,
): boolean {
  return (
    left.query === right.query &&
    left.viewMode === right.viewMode &&
    left.groupMode === right.groupMode &&
    left.statusCategory === right.statusCategory &&
    left.showGitHubActivity === right.showGitHubActivity &&
    left.hasCustomizedKanbanLanes === right.hasCustomizedKanbanLanes &&
    left.hiddenKanbanColumnIds.length === right.hiddenKanbanColumnIds.length &&
    left.hiddenKanbanColumnIds.every((key, index) => key === right.hiddenKanbanColumnIds[index]) &&
    left.excludedTypeKeys.length === right.excludedTypeKeys.length &&
    left.excludedTypeKeys.every((key, index) => key === right.excludedTypeKeys[index]) &&
    left.selectedPriority === right.selectedPriority &&
    left.selectedStatus === right.selectedStatus &&
    left.tableSortBy === right.tableSortBy &&
    left.tableSortDirection === right.tableSortDirection
  );
}

export function areProjectDashboardMyWorkRouteSearchEqual(
  left: ProjectDashboardMyWorkRouteSearch,
  right: ProjectDashboardMyWorkRouteSearch,
): boolean {
  return projectDashboardMyWorkRouteSearchKeys.every((key) => left[key] === right[key]);
}
