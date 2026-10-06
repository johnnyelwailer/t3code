import { useCallback, useDeferredValue, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import {
  buildProjectMyWorkMetrics,
  buildDistinctOptions,
  buildProjectMyWorkStatusOptions,
  countProjectMyWorkActiveOptions,
  hasProjectMyWorkDisplayNameDependentAssignments,
  PROJECT_MY_WORK_RESET_OPTIONS_PATCH,
  setSortedStringMembership,
  shouldShowProjectMyWorkLoadingState,
} from "~/t3team/hooks/t3team-projectMyWorkStateHelpers";
import { useAtlassianCurrentUserDisplayNameState } from "~/t3team/hooks/t3team-useAtlassianCurrentUserDisplayName";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { useProjectMyWorkDerivedData } from "~/t3team/hooks/t3team-useProjectMyWorkDerivedData";
import { useProjectKanbanBoardColumns } from "~/t3team/hooks/t3team-useProjectKanbanBoardColumns";
import { useProjectMyWork } from "~/t3team/hooks/t3team-useProjectMyWork";
import { type ProjectMyWorkStatusCategory } from "~/t3team/t3team-projectMyWork";
import {
  useProjectDashboardMyWorkState,
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
    isLinked,
  } = useProjectMyWork(project);
  const { boardColumns, availableStatuses } = useProjectKanbanBoardColumns(project);
  const tickets = fetchedTickets.length > 0 ? fetchedTickets : fallbackTickets;
  const kanbanProfileId = useMemo(() => readProjectSetupProfileIdFromProject(project), [project]);
  // `project.source.accountId` is the Jira *site* id and can never equal a
  // ticket's `assigneeAccountId`; the viewer's Jira user id comes from the
  // server-scoped My Work page. Display name is only a fallback.
  const identity = useMemo(
    () => ({
      ...(viewerAccountId ? { accountId: viewerAccountId } : {}),
      ...(currentUserDisplayName ? { displayName: currentUserDisplayName } : {}),
    }),
    [currentUserDisplayName, viewerAccountId],
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
    awaitingFirstLoad: isLinked && lastCheckedAt === undefined && loadError === null,
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
    loadError,
    isLinked,
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
