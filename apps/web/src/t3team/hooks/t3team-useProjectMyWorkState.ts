import { useCallback, useDeferredValue, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import {
  buildProjectMyWorkMetrics,
  buildDistinctOptions,
  buildProjectMyWorkStatusOptions,
  countProjectMyWorkActiveOptions,
  buildProjectMyWorkIdentity,
  hasProjectMyWorkDisplayNameDependentAssignments,
  isAwaitingFirstProjectMyWorkLoad,
  PROJECT_MY_WORK_RESET_OPTIONS_PATCH,
  setSortedStringMembership,
  shouldShowProjectMyWorkLoadingState,
} from "~/t3team/hooks/t3team-projectMyWorkStateHelpers";
import { useAtlassianCurrentUserDisplayNameState } from "~/t3team/hooks/t3team-useAtlassianCurrentUserDisplayName";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { useProjectMyWorkDerivedData } from "~/t3team/hooks/t3team-useProjectMyWorkDerivedData";
import { useProjectKanbanColumnCollapse } from "~/t3team/hooks/t3team-useProjectKanbanColumnCollapse";
import { useProjectKanbanBoardColumns } from "~/t3team/hooks/t3team-useProjectKanbanBoardColumns";
import { useProjectMyWork } from "~/t3team/hooks/t3team-useProjectMyWork";
import { type ProjectMyWorkStatusCategory } from "~/t3team/t3team-projectMyWork";
import type { KanbanZoomLevel } from "~/t3team/t3team-kanbanZoom";
import {
  useProjectDashboardMyWorkState,
  type ProjectMyWorkLens,
  type ProjectMyWorkTableSortBy,
  type ProjectMyWorkTableSortDirection,
  type ProjectMyWorkViewMode,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function useProjectMyWorkState({
  project,
  fallbackTickets,
}: {
  project: ProjectShellProject;
  fallbackTickets: ProjectTicket[];
}) {
  const { displayName: currentUserDisplayName, loading: currentUserDisplayNameLoading } =
    useAtlassianCurrentUserDisplayNameState(project.source.accountId);
  const {
    tickets: fetchedTickets,
    viewerAccountId,
    lastCheckedAt,
    reload,
    loading: resourcesLoading,
    error: loadError,
    sessionExpired,
    isLinked,
  } = useProjectMyWork(project);
  const loadStatus = { loadError, sessionExpired, isLinked, onRetry: reload };
  const { boardColumns, availableStatuses } = useProjectKanbanBoardColumns(project);
  const tickets = fetchedTickets.length > 0 ? fetchedTickets : fallbackTickets;
  const kanbanProfileId = useMemo(() => readProjectSetupProfileIdFromProject(project), [project]);
  const identity = useMemo(
    () => buildProjectMyWorkIdentity(viewerAccountId, currentUserDisplayName),
    [currentUserDisplayName, viewerAccountId],
  );

  const { state, setState } = useProjectDashboardMyWorkState(project.id);
  const {
    query,
    lens,
    viewMode,
    groupMode,
    statusCategory,
    hiddenKanbanColumnIds,
    hasCustomizedKanbanLanes,
    excludedTypeKeys,
    selectedPriority,
    selectedStatus,
    tableSortBy,
    tableSortDirection,
    kanbanZoomLevel,
  } = state;
  const deferredQuery = useDeferredValue(query);
  const columnCollapse = useProjectKanbanColumnCollapse({ state, setState });
  const updateState = useCallback(
    (partial: Partial<typeof state>) => {
      setState((current) => ({ ...current, ...partial }));
    },
    [setState],
  );

  const {
    assignedWorkItems,
    filteredWorkItems,
    visibleHierarchy,
    typeOptions,
    normalizedExcludedTypeKeys,
    kanbanLaneOptions,
    normalizedHiddenKanbanColumnIds,
    kanbanDisplayColumns,
    kanbanVisibleHierarchy,
  } = useProjectMyWorkDerivedData({
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
    lens,
  });
  const loading = shouldShowProjectMyWorkLoadingState({
    resourcesLoading,
    awaitingFirstLoad: isAwaitingFirstProjectMyWorkLoad(loadStatus, lastCheckedAt),
    ticketCount: tickets.length,
    currentUserDisplayNameLoading,
    hasDisplayNameDependentAssignments: hasProjectMyWorkDisplayNameDependentAssignments(
      tickets,
      viewerAccountId,
    ),
    assignedWorkItemsCount: assignedWorkItems.length,
  });
  const statusOptions = useMemo(
    () => buildProjectMyWorkStatusOptions(availableStatuses, assignedWorkItems),
    [assignedWorkItems, availableStatuses],
  );

  return {
    loading,
    loadStatus,
    tickets,
    reloadTickets: reload,
    currentUserDisplayName,
    jiraLastCheckedAt: lastCheckedAt,
    query,
    setQuery: (value: string) => updateState({ query: value }),
    lens,
    setLens: (value: ProjectMyWorkLens) => updateState({ lens: value }),
    viewMode,
    setViewMode: (value: ProjectMyWorkViewMode) => updateState({ viewMode: value }),
    groupMode,
    setGroupMode: (value: "flat" | "hierarchy") => updateState({ groupMode: value }),
    statusCategory,
    setStatusCategory: (value: ProjectMyWorkStatusCategory) =>
      updateState({ statusCategory: value }),
    hiddenKanbanColumnIds: normalizedHiddenKanbanColumnIds,
    columnCollapse,
    toggleKanbanLaneVisibility: (columnId: string, visible: boolean) =>
      setState((current) => ({
        ...current,
        hasCustomizedKanbanLanes: true,
        hiddenKanbanColumnIds: setSortedStringMembership(
          normalizedHiddenKanbanColumnIds,
          columnId,
          !visible,
        ),
      })),
    excludedTypeKeys: normalizedExcludedTypeKeys,
    setExcludedTypeKeys: (value: string[]) => updateState({ excludedTypeKeys: value }),
    epicsHidden: normalizedExcludedTypeKeys.includes("epic"),
    setEpicsHidden: (hidden: boolean) =>
      setState((current) => ({
        ...current,
        excludedTypeKeys: setSortedStringMembership(current.excludedTypeKeys, "epic", hidden),
      })),
    toggleTypeVisibility: (typeKey: string, visible: boolean) =>
      setState((current) => ({
        ...current,
        excludedTypeKeys: setSortedStringMembership(current.excludedTypeKeys, typeKey, !visible),
      })),
    selectedPriority,
    setSelectedPriority: (value: string) => updateState({ selectedPriority: value }),
    priorityOptions: buildDistinctOptions(assignedWorkItems.map((ticket) => ticket.priority)),
    selectedStatus,
    setSelectedStatus: (value: string) => updateState({ selectedStatus: value }),
    statusOptions,
    typeOptions,
    kanbanLaneOptions,
    tableSortBy,
    setTableSortBy: (value: ProjectMyWorkTableSortBy) => updateState({ tableSortBy: value }),
    tableSortDirection,
    setTableSortDirection: (value: ProjectMyWorkTableSortDirection) =>
      updateState({ tableSortDirection: value }),
    kanbanZoomLevel,
    setKanbanZoomLevel: (value: KanbanZoomLevel) => updateState({ kanbanZoomLevel: value }),
    activeOptionsCount: countProjectMyWorkActiveOptions({
      lens,
      statusCategory,
      selectedPriority,
      selectedStatus,
      hasCustomizedKanbanLanes,
      hiddenKanbanColumnIds: normalizedHiddenKanbanColumnIds,
      excludedTypeKeys: normalizedExcludedTypeKeys,
    }),
    resetOptionsFilters: () => updateState(PROJECT_MY_WORK_RESET_OPTIONS_PATCH),
    assignedWorkItems,
    filteredWorkItems,
    visibleHierarchy,
    visibleContextCount: Math.max(
      0,
      visibleHierarchy.visibleTickets.length - filteredWorkItems.length,
    ),
    metrics: buildProjectMyWorkMetrics(assignedWorkItems),
    kanbanColumns: kanbanDisplayColumns,
    parentChildGroups: kanbanVisibleHierarchy.hierarchy,
  };
}
