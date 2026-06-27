import type { ProjectDashboardBacklogState } from "~/t3work/t3work-projectDashboardBacklogState";

export function buildProjectDashboardBacklogVisibleSyncState(input: {
  readonly backlogState: ProjectDashboardBacklogState;
  readonly visibleWorkItemCount: number;
}) {
  const { backlogState } = input;
  return {
    surface: "backlog",
    query: backlogState.query,
    viewMode: backlogState.viewMode,
    boardId: backlogState.boardId,
    sprintId: backlogState.sprintId,
    filterId: backlogState.filterId,
    focusFilter: backlogState.focusFilter,
    assigneeFilter: backlogState.assigneeFilter,
    assigneeFilterScope: backlogState.assigneeFilterScope,
    visibleIssueTypes: backlogState.visibleIssueTypes,
    tableGroupBy: backlogState.tableGroupBy,
    tableSortBy: backlogState.tableSortBy,
    tableSortDirection: backlogState.tableSortDirection,
    visibleTableColumns: backlogState.visibleTableColumns,
    visibleWorkItemCount: input.visibleWorkItemCount,
  };
}
