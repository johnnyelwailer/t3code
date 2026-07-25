import type { ProjectTicketKanbanBoardColumn } from "~/t3team/t3team-projectTicketStatus";
import {
  buildProjectMyWorkFlatKanbanColumns,
  filterProjectMyWorkKanbanColumnsByHiddenColumns,
  filterProjectMyWorkTickets,
  sortProjectMyWorkTickets,
  buildProjectMyWorkVisibleHierarchy,
  type ProjectMyWorkIdentity,
  type ProjectMyWorkStatusCategory,
} from "~/t3team/t3team-projectMyWork";
import type {
  ProjectMyWorkGroupMode,
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectTicket } from "~/t3team/t3team-types";

type ProjectMyWorkVisibleHierarchy = ReturnType<typeof buildProjectMyWorkVisibleHierarchy>;
type ProjectMyWorkKanbanColumns = Parameters<
  typeof buildProjectMyWorkFlatKanbanColumns
>[0]["columns"];

export function buildAssignedWorkItems(
  tickets: readonly ProjectTicket[],
  identity: ProjectMyWorkIdentity,
) {
  return filterProjectMyWorkTickets({
    tickets,
    identity,
    query: "",
    statusCategory: "all",
    excludedTypeKeys: [],
    selectedPriority: "all",
    selectedStatus: "all",
  });
}

export function filterAndSortProjectMyWorkItems(input: {
  tickets: readonly ProjectTicket[];
  identity: ProjectMyWorkIdentity;
  query: string;
  statusCategory: ProjectMyWorkStatusCategory;
  excludedTypeKeys: ReadonlyArray<string>;
  selectedPriority: string;
  selectedStatus: string;
  tableSortBy: ProjectMyWorkTableSortBy;
  tableSortDirection: ProjectMyWorkTableSortDirection;
}) {
  const filtered = filterProjectMyWorkTickets({
    tickets: input.tickets,
    identity: input.identity,
    query: input.query,
    statusCategory: input.statusCategory,
    excludedTypeKeys: input.excludedTypeKeys,
    selectedPriority: input.selectedPriority,
    selectedStatus: input.selectedStatus,
  });
  return sortProjectMyWorkTickets({
    tickets: filtered,
    sortBy: input.tableSortBy,
    sortDirection: input.tableSortDirection,
  });
}

export function buildProjectKanbanColumnOptions(
  kanbanProfileId?: string,
  boardColumns?: ReadonlyArray<ProjectTicketKanbanBoardColumn>,
  availableStatuses?: ReadonlyArray<ProjectTicketKanbanBoardColumn["statuses"][number]>,
) {
  return {
    ...(kanbanProfileId ? { profileId: kanbanProfileId } : {}),
    ...(availableStatuses ? { availableStatuses } : {}),
    ...(boardColumns ? { boardColumns } : {}),
  };
}

export function normalizeHiddenKanbanColumnIds(
  hiddenKanbanColumnIds: ReadonlyArray<string>,
  laneOptions: ReadonlyArray<{ id: string }>,
) {
  const validIds = new Set(laneOptions.map((option) => option.id));
  return hiddenKanbanColumnIds.filter((columnId) => validIds.has(columnId));
}

export function buildVisibleMyWorkHierarchy(
  tickets: readonly ProjectTicket[],
  visibleTickets: readonly ProjectTicket[],
  tableSortBy: ProjectMyWorkTableSortBy,
  tableSortDirection: ProjectMyWorkTableSortDirection,
  excludedVisibleTypeKeys: ReadonlyArray<string>,
) {
  return buildProjectMyWorkVisibleHierarchy(tickets, visibleTickets, {
    sortBy: tableSortBy,
    sortDirection: tableSortDirection,
    excludedVisibleTypeKeys,
  });
}

export function buildProjectMyWorkDisplayColumns(
  groupMode: ProjectMyWorkGroupMode,
  kanbanColumns: ProjectMyWorkKanbanColumns,
  visibleHierarchy: ProjectMyWorkVisibleHierarchy,
  hiddenKanbanColumnIds: ReadonlyArray<string>,
) {
  const displayColumns =
    groupMode === "hierarchy"
      ? kanbanColumns
      : buildProjectMyWorkFlatKanbanColumns({
          columns: kanbanColumns,
          visibleHierarchy,
          hiddenKanbanColumnIds,
        });

  return filterProjectMyWorkKanbanColumnsByHiddenColumns(displayColumns, hiddenKanbanColumnIds);
}
