import { useMemo } from "react";

import {
  buildProjectMyWorkKanbanLaneOptions,
  buildProjectMyWorkTypeOptions,
  filterProjectMyWorkKanbanTicketsByHiddenColumns,
  type ProjectMyWorkIdentity,
  type ProjectMyWorkStatusCategory,
} from "~/t3team/t3team-projectMyWork";
import {
  buildProjectTicketKanbanColumns,
  type ProjectTicketKanbanBoardColumn,
} from "~/t3team/t3team-projectTicketStatus";
import {
  buildAssignedWorkItems,
  buildProjectMyWorkDisplayColumns,
  buildVisibleMyWorkHierarchy,
  buildProjectKanbanColumnOptions,
  filterAndSortProjectMyWorkItems,
} from "~/t3team/hooks/t3team-projectKanbanDerivedData";
import { resolveProjectMyWorkHiddenKanbanColumnIds } from "~/t3team/hooks/t3team-projectMyWorkStateHelpers";
import type {
  ProjectMyWorkGroupMode,
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function useProjectMyWorkDerivedData({
  tickets,
  identity,
  deferredQuery,
  statusCategory,
  excludedTypeKeys,
  hiddenKanbanColumnIds,
  selectedPriority,
  selectedStatus,
  tableSortBy,
  tableSortDirection,
  groupMode,
  hasCustomizedKanbanLanes,
  boardColumns,
  availableStatuses,
  kanbanProfileId,
}: {
  tickets: readonly ProjectTicket[];
  identity: ProjectMyWorkIdentity;
  deferredQuery: string;
  statusCategory: ProjectMyWorkStatusCategory;
  excludedTypeKeys: ReadonlyArray<string>;
  hiddenKanbanColumnIds: ReadonlyArray<string>;
  selectedPriority: string;
  selectedStatus: string;
  tableSortBy: ProjectMyWorkTableSortBy;
  tableSortDirection: ProjectMyWorkTableSortDirection;
  groupMode: ProjectMyWorkGroupMode;
  hasCustomizedKanbanLanes: boolean;
  boardColumns?: ReadonlyArray<ProjectTicketKanbanBoardColumn>;
  availableStatuses?: ReadonlyArray<ProjectTicketKanbanBoardColumn["statuses"][number]>;
  kanbanProfileId?: string;
}) {
  const assignedWorkItems = useMemo(
    () => buildAssignedWorkItems(tickets, identity),
    [identity, tickets],
  );

  const preTypeFilterWorkItems = useMemo(() => {
    return filterAndSortProjectMyWorkItems({
      tickets,
      identity,
      query: deferredQuery,
      statusCategory,
      excludedTypeKeys: [],
      selectedPriority,
      selectedStatus,
      tableSortBy,
      tableSortDirection,
    });
  }, [
    deferredQuery,
    identity,
    selectedPriority,
    selectedStatus,
    statusCategory,
    tableSortBy,
    tableSortDirection,
    tickets,
  ]);

  const preTypeFilterVisibleHierarchy = useMemo(
    () =>
      buildVisibleMyWorkHierarchy(
        tickets,
        preTypeFilterWorkItems,
        tableSortBy,
        tableSortDirection,
        [],
      ),
    [preTypeFilterWorkItems, tableSortBy, tableSortDirection, tickets],
  );

  const { normalizedExcludedTypeKeys, typeOptions } = useMemo(() => {
    const typeOptions = buildProjectMyWorkTypeOptions(preTypeFilterVisibleHierarchy.visibleTickets);
    const validKeys = new Set(typeOptions.map((option) => option.key));
    return {
      typeOptions,
      normalizedExcludedTypeKeys: excludedTypeKeys.filter((key) => validKeys.has(key)),
    };
  }, [excludedTypeKeys, preTypeFilterVisibleHierarchy.visibleTickets]);

  const filteredWorkItems = useMemo(() => {
    return filterAndSortProjectMyWorkItems({
      tickets,
      identity,
      query: deferredQuery,
      statusCategory,
      excludedTypeKeys: normalizedExcludedTypeKeys,
      selectedPriority,
      selectedStatus,
      tableSortBy,
      tableSortDirection,
    });
  }, [
    deferredQuery,
    identity,
    normalizedExcludedTypeKeys,
    selectedPriority,
    selectedStatus,
    statusCategory,
    tableSortBy,
    tableSortDirection,
    tickets,
  ]);

  const visibleHierarchy = useMemo(
    () =>
      buildVisibleMyWorkHierarchy(
        tickets,
        filteredWorkItems,
        tableSortBy,
        tableSortDirection,
        normalizedExcludedTypeKeys,
      ),
    [filteredWorkItems, normalizedExcludedTypeKeys, tableSortBy, tableSortDirection, tickets],
  );

  const kanbanColumnOptions = useMemo(
    () => buildProjectKanbanColumnOptions(kanbanProfileId, boardColumns, availableStatuses),
    [availableStatuses, boardColumns, kanbanProfileId],
  );

  const { kanbanLaneOptions, normalizedHiddenKanbanColumnIds } = useMemo(() => {
    const laneColumns = buildProjectTicketKanbanColumns(filteredWorkItems, kanbanColumnOptions);
    const kanbanLaneOptions = buildProjectMyWorkKanbanLaneOptions(laneColumns);
    return {
      kanbanLaneOptions,
      normalizedHiddenKanbanColumnIds: resolveProjectMyWorkHiddenKanbanColumnIds({
        hiddenKanbanColumnIds,
        hasCustomizedKanbanLanes,
        kanbanLaneOptions,
      }),
    };
  }, [filteredWorkItems, hasCustomizedKanbanLanes, hiddenKanbanColumnIds, kanbanColumnOptions]);

  const kanbanVisibleWorkItems = useMemo(
    () =>
      filterProjectMyWorkKanbanTicketsByHiddenColumns(
        filteredWorkItems,
        normalizedHiddenKanbanColumnIds,
      ),
    [filteredWorkItems, normalizedHiddenKanbanColumnIds],
  );

  const kanbanColumns = useMemo(
    () => buildProjectTicketKanbanColumns(kanbanVisibleWorkItems, kanbanColumnOptions),
    [kanbanColumnOptions, kanbanVisibleWorkItems],
  );

  const kanbanVisibleHierarchy = useMemo(
    () =>
      buildVisibleMyWorkHierarchy(
        tickets,
        kanbanVisibleWorkItems,
        tableSortBy,
        tableSortDirection,
        normalizedExcludedTypeKeys,
      ),
    [kanbanVisibleWorkItems, normalizedExcludedTypeKeys, tableSortBy, tableSortDirection, tickets],
  );

  const kanbanDisplayColumns = useMemo(
    () =>
      buildProjectMyWorkDisplayColumns(
        groupMode,
        kanbanColumns,
        kanbanVisibleHierarchy,
        normalizedHiddenKanbanColumnIds,
      ),
    [groupMode, kanbanColumns, kanbanVisibleHierarchy, normalizedHiddenKanbanColumnIds],
  );

  return {
    assignedWorkItems,
    filteredWorkItems,
    visibleHierarchy,
    typeOptions,
    normalizedExcludedTypeKeys,
    kanbanLaneOptions,
    normalizedHiddenKanbanColumnIds,
    kanbanDisplayColumns,
    kanbanVisibleHierarchy,
  };
}
