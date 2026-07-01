import { useCallback, useDeferredValue, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import {
  buildProjectMyWorkMetrics,
  buildDistinctOptions,
  buildProjectMyWorkStatusOptions,
  countProjectMyWorkActiveOptions,
  hasProjectMyWorkDisplayNameDependentAssignments,
  setSortedStringMembership,
  shouldShowProjectMyWorkLoadingState,
} from "~/t3work/hooks/t3work-projectMyWorkStateHelpers";
import { useAtlassianCurrentUserDisplayNameState } from "~/t3work/hooks/t3work-useAtlassianCurrentUserDisplayName";
import { readProjectSetupProfileIdFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { useProjectMyWorkDerivedData } from "~/t3work/hooks/t3work-useProjectMyWorkDerivedData";
import { useProjectKanbanBoardColumns } from "~/t3work/hooks/t3work-useProjectKanbanBoardColumns";
import { useProjectMyWork } from "~/t3work/hooks/t3work-useProjectMyWork";
import { type ProjectMyWorkStatusCategory } from "~/t3work/t3work-projectMyWork";
import {
  useProjectDashboardMyWorkState,
  type ProjectMyWorkTableSortBy,
  type ProjectMyWorkTableSortDirection,
  type ProjectMyWorkViewMode,
} from "~/t3work/t3work-projectDashboardMyWorkState";
import type { ProjectTicket } from "~/t3work/t3work-types";

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
    lastCheckedAt,
    reload,
    loading: resourcesLoading,
  } = useProjectMyWork(project);
  const { boardColumns, availableStatuses } = useProjectKanbanBoardColumns(project);
  const tickets = fetchedTickets.length > 0 ? fetchedTickets : fallbackTickets;
  const kanbanProfileId = useMemo(() => readProjectSetupProfileIdFromProject(project), [project]);
  const identity = useMemo(
    () => ({
      ...(project.source.accountId ? { accountId: project.source.accountId } : {}),
      ...(currentUserDisplayName ? { displayName: currentUserDisplayName } : {}),
    }),
    [currentUserDisplayName, project.source.accountId],
  );

  const { state, setState } = useProjectDashboardMyWorkState(project.id);
  const {
    query,
    viewMode,
    groupMode,
    statusCategory,
    showGitHubActivity,
    hiddenKanbanColumnIds,
    hasCustomizedKanbanLanes,
    excludedTypeKeys,
    selectedPriority,
    selectedStatus,
    tableSortBy,
    tableSortDirection,
  } = state;
  const deferredQuery = useDeferredValue(query);
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
  });
  const loading = shouldShowProjectMyWorkLoadingState({
    resourcesLoading,
    ticketCount: tickets.length,
    currentUserDisplayNameLoading,
    hasDisplayNameDependentAssignments: hasProjectMyWorkDisplayNameDependentAssignments(
      tickets,
      project.source.accountId,
    ),
    assignedWorkItemsCount: assignedWorkItems.length,
  });
  const statusOptions = useMemo(
    () => buildProjectMyWorkStatusOptions(availableStatuses, assignedWorkItems),
    [assignedWorkItems, availableStatuses],
  );

  return {
    loading,
    tickets,
    reloadTickets: reload,
    currentUserDisplayName,
    jiraLastCheckedAt: lastCheckedAt,
    query,
    setQuery: (value: string) => updateState({ query: value }),
    viewMode,
    setViewMode: (value: ProjectMyWorkViewMode) => updateState({ viewMode: value }),
    groupMode,
    setGroupMode: (value: "flat" | "hierarchy") => updateState({ groupMode: value }),
    statusCategory,
    setStatusCategory: (value: ProjectMyWorkStatusCategory) =>
      updateState({ statusCategory: value }),
    showGitHubActivity,
    setShowGitHubActivity: (value: boolean) => updateState({ showGitHubActivity: value }),
    hiddenKanbanColumnIds: normalizedHiddenKanbanColumnIds,
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
    activeOptionsCount: countProjectMyWorkActiveOptions({
      showGitHubActivity,
      statusCategory,
      selectedPriority,
      selectedStatus,
      hasCustomizedKanbanLanes,
      hiddenKanbanColumnIds: normalizedHiddenKanbanColumnIds,
      excludedTypeKeys: normalizedExcludedTypeKeys,
    }),
    resetOptionsFilters: () => {
      updateState({
        showGitHubActivity: true,
        statusCategory: "all",
        hiddenKanbanColumnIds: [],
        hasCustomizedKanbanLanes: false,
        excludedTypeKeys: [],
        selectedPriority: "all",
        selectedStatus: "all",
      });
    },
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
