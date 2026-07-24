import type { ProjectMyWorkStatusCategory } from "~/t3team/t3team-projectMyWork";

export type ProjectMyWorkViewMode = "table" | "list" | "grid" | "kanban";
export type ProjectMyWorkGroupMode = "flat" | "hierarchy";
export type ProjectMyWorkKanbanLaneSelectionMode = "auto" | "custom";
export type ProjectMyWorkTableSortBy = "updated" | "title" | "status" | "assignee";
export type ProjectMyWorkTableSortDirection = "asc" | "desc";

export interface ProjectDashboardMyWorkRouteSearch {
  myWorkQ?: string;
  myWorkView?: ProjectMyWorkViewMode;
  myWorkGroup?: ProjectMyWorkGroupMode;
  myWorkStatus?: ProjectMyWorkStatusCategory;
  myWorkGitHub?: "show" | "hide";
  myWorkLanes?: string;
  myWorkLanesMode?: ProjectMyWorkKanbanLaneSelectionMode;
  myWorkPriority?: string;
  myWorkTicketStatus?: string;
  myWorkTypes?: string;
  myWorkSort?: ProjectMyWorkTableSortBy;
  myWorkDir?: ProjectMyWorkTableSortDirection;
}

export interface ProjectDashboardMyWorkState {
  query: string;
  viewMode: ProjectMyWorkViewMode;
  groupMode: ProjectMyWorkGroupMode;
  statusCategory: ProjectMyWorkStatusCategory;
  showGitHubActivity: boolean;
  hiddenKanbanColumnIds: ReadonlyArray<string>;
  hasCustomizedKanbanLanes: boolean;
  excludedTypeKeys: ReadonlyArray<string>;
  selectedPriority: string;
  selectedStatus: string;
  tableSortBy: ProjectMyWorkTableSortBy;
  tableSortDirection: ProjectMyWorkTableSortDirection;
}

export type PersistedProjectDashboardMyWorkState = Partial<ProjectDashboardMyWorkState>;

export const projectMyWorkViewModeValues = new Set<ProjectMyWorkViewMode>([
  "table",
  "list",
  "grid",
  "kanban",
]);
export const projectMyWorkGroupModeValues = new Set<ProjectMyWorkGroupMode>(["flat", "hierarchy"]);
export const projectMyWorkStatusCategoryValues = new Set<ProjectMyWorkStatusCategory>([
  "all",
  "active",
  "review",
  "done",
]);
export const projectMyWorkKanbanLaneSelectionModeValues =
  new Set<ProjectMyWorkKanbanLaneSelectionMode>(["auto", "custom"]);
export const projectMyWorkGitHubVisibilityValues = new Set(["show", "hide"] as const);
export const projectMyWorkTableSortByValues = new Set<ProjectMyWorkTableSortBy>([
  "updated",
  "title",
  "status",
  "assignee",
]);
export const projectMyWorkTableSortDirectionValues = new Set<ProjectMyWorkTableSortDirection>([
  "asc",
  "desc",
]);

export const projectDashboardMyWorkRouteSearchKeys = [
  "myWorkQ",
  "myWorkView",
  "myWorkGroup",
  "myWorkStatus",
  "myWorkGitHub",
  "myWorkLanes",
  "myWorkLanesMode",
  "myWorkPriority",
  "myWorkTicketStatus",
  "myWorkTypes",
  "myWorkSort",
  "myWorkDir",
] as const;

export function parseRouteEnum<TValue extends string>(
  value: unknown,
  allowedValues: ReadonlySet<TValue>,
): TValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return allowedValues.has(value as TValue) ? (value as TValue) : undefined;
}

export function parseRouteString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parsePersistedStringList(value: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
  return parsed.length > 0 ? [...new Set(parsed)].toSorted() : [];
}

export function parseRouteStringList(value: unknown): ReadonlyArray<string> | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? [...new Set(parsed)].toSorted() : [];
}

export function createDefaultProjectDashboardMyWorkState(): ProjectDashboardMyWorkState {
  return {
    query: "",
    viewMode: "kanban",
    groupMode: "hierarchy",
    statusCategory: "all",
    showGitHubActivity: true,
    hiddenKanbanColumnIds: [],
    hasCustomizedKanbanLanes: false,
    excludedTypeKeys: [],
    selectedPriority: "all",
    selectedStatus: "all",
    tableSortBy: "updated",
    tableSortDirection: "desc",
  };
}

export function getProjectDashboardMyWorkStorageKey(projectId: string): string {
  return `t3team:project-my-work-state:v1:${projectId}`;
}

export function parseProjectDashboardMyWorkRouteSearch(
  search: Record<string, unknown>,
): ProjectDashboardMyWorkRouteSearch {
  const parsed: ProjectDashboardMyWorkRouteSearch = {};

  if (typeof search.myWorkQ === "string") {
    parsed.myWorkQ = search.myWorkQ;
  }

  const viewMode = parseRouteEnum(search.myWorkView, projectMyWorkViewModeValues);
  if (viewMode !== undefined) {
    parsed.myWorkView = viewMode;
  }

  const groupMode = parseRouteEnum(search.myWorkGroup, projectMyWorkGroupModeValues);
  if (groupMode !== undefined) {
    parsed.myWorkGroup = groupMode;
  }

  const statusCategory = parseRouteEnum(search.myWorkStatus, projectMyWorkStatusCategoryValues);
  if (statusCategory !== undefined) {
    parsed.myWorkStatus = statusCategory;
  }

  const gitHubVisibility = parseRouteEnum(search.myWorkGitHub, projectMyWorkGitHubVisibilityValues);
  if (gitHubVisibility !== undefined) {
    parsed.myWorkGitHub = gitHubVisibility;
  }

  const hiddenKanbanColumnIds = parseRouteStringList(search.myWorkLanes);
  if (hiddenKanbanColumnIds !== undefined) {
    parsed.myWorkLanes = hiddenKanbanColumnIds.join(",");
  }

  const kanbanLaneSelectionMode = parseRouteEnum(
    search.myWorkLanesMode,
    projectMyWorkKanbanLaneSelectionModeValues,
  );
  if (kanbanLaneSelectionMode !== undefined) {
    parsed.myWorkLanesMode = kanbanLaneSelectionMode;
  }

  const selectedPriority = parseRouteString(search.myWorkPriority);
  if (selectedPriority !== undefined) {
    parsed.myWorkPriority = selectedPriority;
  }

  const selectedStatus = parseRouteString(search.myWorkTicketStatus);
  if (selectedStatus !== undefined) {
    parsed.myWorkTicketStatus = selectedStatus;
  }

  const excludedTypeKeys = parseRouteStringList(search.myWorkTypes);
  if (excludedTypeKeys !== undefined) {
    parsed.myWorkTypes = excludedTypeKeys.join(",");
  }

  const tableSortBy = parseRouteEnum(search.myWorkSort, projectMyWorkTableSortByValues);
  if (tableSortBy !== undefined) {
    parsed.myWorkSort = tableSortBy;
  }

  const tableSortDirection = parseRouteEnum(
    search.myWorkDir,
    projectMyWorkTableSortDirectionValues,
  );
  if (tableSortDirection !== undefined) {
    parsed.myWorkDir = tableSortDirection;
  }

  return parsed;
}
