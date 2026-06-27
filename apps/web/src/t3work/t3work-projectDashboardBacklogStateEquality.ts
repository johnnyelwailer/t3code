import { areProjectBacklogAssigneeFilterScopesEqual } from "./t3work-projectBacklogUtils";
import {
  routeSearchKeys,
  type ProjectDashboardBacklogRouteSearch,
  type ProjectDashboardBacklogState,
} from "./t3work-projectDashboardBacklogStateShared";

export function areProjectDashboardBacklogStatesEqual(
  left: ProjectDashboardBacklogState,
  right: ProjectDashboardBacklogState,
): boolean {
  return (
    left.query === right.query &&
    left.focusFilter === right.focusFilter &&
    left.assigneeFilter === right.assigneeFilter &&
    areProjectBacklogAssigneeFilterScopesEqual(
      left.assigneeFilterScope,
      right.assigneeFilterScope,
    ) &&
    left.visibleIssueTypes.length === right.visibleIssueTypes.length &&
    left.visibleIssueTypes.every((value, index) => value === right.visibleIssueTypes[index]) &&
    left.viewMode === right.viewMode &&
    left.tableGroupBy === right.tableGroupBy &&
    left.tableSortBy === right.tableSortBy &&
    left.tableSortDirection === right.tableSortDirection &&
    left.visibleTableColumns.length === right.visibleTableColumns.length &&
    left.visibleTableColumns.every(
      (column, index) => column === right.visibleTableColumns[index],
    ) &&
    left.boardId === right.boardId &&
    left.sprintId === right.sprintId &&
    left.filterId === right.filterId
  );
}

export function areProjectDashboardBacklogRouteSearchEqual(
  left: ProjectDashboardBacklogRouteSearch,
  right: ProjectDashboardBacklogRouteSearch,
): boolean {
  return routeSearchKeys.every((key) => left[key] === right[key]);
}
