import { useCallback, useDeferredValue, useMemo, useRef } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useAtlassianCurrentUserDisplayName } from "~/t3work/hooks/t3work-useAtlassianCurrentUserDisplayName";
import { useProjectBacklog } from "~/t3work/hooks/t3work-useProjectBacklog";
import { useProjectDashboardBacklogRecipeSupport } from "~/t3work/hooks/t3work-useProjectDashboardBacklogRecipeSupport";
import { useTicketAgentContext } from "~/t3work/hooks/t3work-useTicketAgentContext";
import { useProjectDashboardBacklogDerivedData } from "~/t3work/hooks/t3work-useProjectDashboardBacklogDerivedData";
import { useProjectBacklogRemoteSearch } from "~/t3work/hooks/t3work-useProjectBacklogRemoteSearch";
import { useProjectDashboardBacklogState } from "~/t3work/hooks/t3work-useProjectDashboardBacklogState";
import { useProjectDashboardBacklogTableState } from "~/t3work/hooks/t3work-useProjectDashboardBacklogTableState";
import { useProjectDashboardBacklogCapacity } from "~/t3work/hooks/t3work-useProjectDashboardBacklogCapacity";
import { useProjectWorkspaceAutoSync } from "~/t3work/hooks/t3work-useProjectWorkspaceAutoSync";
import { ProjectDashboardBacklogContent } from "~/t3work/t3work-ProjectDashboardBacklogContent";
import { ProjectDashboardBacklogViewLayout } from "~/t3work/t3work-ProjectDashboardBacklogViewLayout";
import { ProjectDashboardBacklogOverviewSection } from "~/t3work/t3work-ProjectDashboardBacklogOverviewSection";
import { buildProjectDashboardBacklogVisibleSyncState } from "~/t3work/t3work-projectDashboardBacklogVisibleSync";
import { buildRequestedBacklogSelection } from "~/t3work/t3work-projectDashboardBacklogStateShared";
import { isProjectBacklogImmersiveViewMode } from "~/t3work/t3work-projectBacklogPresentationMeta";

export function ProjectDashboardBacklogView({
  project,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { state: backlogState, setState: setBacklogState } = useProjectDashboardBacklogState(
    project.id,
  );
  const currentUserDisplayName = useAtlassianCurrentUserDisplayName(project.source.accountId);
  const deferredQuery = useDeferredValue(backlogState.query);
  const requestedSelection = useMemo(
    () => buildRequestedBacklogSelection(backlogState),
    [
      backlogState.boardId,
      backlogState.filterId,
      backlogState.selectedQuickFilterIds,
      backlogState.sprintId,
    ],
  );
  const onOpenTicketRef = useRef(onOpenTicket);
  onOpenTicketRef.current = onOpenTicket;
  const {
    tickets,
    capabilities,
    boards,
    sprints,
    savedFilters,
    quickFilters,
    loading,
    error,
    hasLoaded,
    searchAssignableUsers,
    updateAssignee,
    updateEstimate,
    createSubtask,
    refreshBacklog,
  } = useProjectBacklog(project, {
    selection: requestedSelection,
    onSelectionChange: (selection) =>
      setBacklogState((current) => ({
        ...current,
        boardId: selection.boardId,
        sprintId: selection.sprintId,
        filterId: selection.filterId,
      })),
  });
  const { searchTickets } = useProjectBacklogRemoteSearch({
    project,
    selection: requestedSelection,
    query: deferredQuery,
  });
  const {
    assigneeOptions,
    filteredTickets,
    hierarchyPresentation,
    labelOptions,
    ownershipGroups,
    planningLanes,
  } = useProjectDashboardBacklogDerivedData({
    tickets,
    query: deferredQuery,
    focusFilter: backlogState.focusFilter,
    assigneeFilter: backlogState.assigneeFilter,
    assigneeFilterScope: backlogState.assigneeFilterScope,
    visibleIssueTypes: backlogState.visibleIssueTypes,
    selectedLabels: backlogState.selectedLabels,
    currentUserDisplayName,
    searchTickets,
  });
  const { getTicketAgentContext, openTicketAgentContextMenu } = useTicketAgentContext({
    project,
    projectTickets: tickets,
  });

  const handleOpenTicket = useCallback(
    (projectId: string, ticketId: string) => onOpenTicketRef.current(projectId, ticketId),
    [],
  );
  const {
    collapseGroupsRequestKey,
    expandGroupsRequestKey,
    handleTableSortByChange,
    handleTableSortDirectionChange,
    handleVisibleTableColumnsChange,
    requestCollapseTableGroups,
    requestExpandTableGroups,
  } = useProjectDashboardBacklogTableState({ setBacklogState });
  useProjectDashboardBacklogRecipeSupport({
    project,
    state: backlogState,
    currentUserDisplayName,
    filteredTickets,
    setState: setBacklogState,
  });

  const isImmersiveView = isProjectBacklogImmersiveViewMode(backlogState.viewMode);

  const ownerCapacities = useProjectDashboardBacklogCapacity({
    tickets,
    sprints,
    selectedSprintId: backlogState.sprintId,
    enabled: backlogState.viewMode === "planning-space",
    projectAccountId: project.source.accountId,
  });
  useProjectWorkspaceAutoSync({
    project,
    ...(hasLoaded ? { projectTickets: tickets } : {}),
    uiState: buildProjectDashboardBacklogVisibleSyncState({
      backlogState,
      visibleWorkItemCount: filteredTickets.length,
    }),
  });

  const overview = (
    <ProjectDashboardBacklogOverviewSection
      backlogState={backlogState}
      setBacklogState={setBacklogState}
      loading={loading}
      assigneeOptions={assigneeOptions}
      labelOptions={labelOptions}
      savedFilters={savedFilters}
      quickFilters={quickFilters}
      boards={boards}
      sprints={sprints}
      onTableSortByChange={handleTableSortByChange}
      onTableSortDirectionChange={handleTableSortDirectionChange}
      onVisibleTableColumnsChange={handleVisibleTableColumnsChange}
      onCollapseTableGroups={requestCollapseTableGroups}
      onExpandTableGroups={requestExpandTableGroups}
      onRefreshData={() => void refreshBacklog({ clearProjectCache: true })}
    />
  );

  const content = (
    <ProjectDashboardBacklogContent
      projectId={project.id}
      viewMode={backlogState.viewMode}
      loading={loading}
      {...(backlogState.sprintId ? { selectedSprintId: backlogState.sprintId } : {})}
      {...(project.source.accountId ? { currentUserAccountId: project.source.accountId } : {})}
      {...(currentUserDisplayName ? { currentUserDisplayName } : {})}
      {...(ownerCapacities ? { ownerCapacities } : {})}
      filteredTickets={filteredTickets}
      hierarchy={hierarchyPresentation.visibleHierarchy}
      contextByTicketId={hierarchyPresentation.contextByTicketId}
      matchedTicketIds={hierarchyPresentation.matchedTicketIds}
      planningLanes={planningLanes}
      ownershipGroups={ownershipGroups}
      tableGroupBy={backlogState.tableGroupBy}
      tableSortBy={backlogState.tableSortBy}
      tableSortDirection={backlogState.tableSortDirection}
      visibleTableColumns={backlogState.visibleTableColumns}
      collapseGroupsRequestKey={collapseGroupsRequestKey}
      expandGroupsRequestKey={expandGroupsRequestKey}
      canCreateSubtasks={capabilities.canCreateSubtasks}
      onTicketContextMenu={openTicketAgentContextMenu}
      getTicketAgentContext={getTicketAgentContext}
      onOpenTicket={handleOpenTicket}
      onSearchAssignableUsers={searchAssignableUsers}
      onUpdateAssignee={updateAssignee}
      onUpdateEstimate={updateEstimate}
      onCreateSubtask={createSubtask}
      onTableSortByChange={handleTableSortByChange}
      onTableSortDirectionChange={handleTableSortDirectionChange}
      {...(capabilities.estimateFieldLabel
        ? { estimateFieldLabel: capabilities.estimateFieldLabel }
        : {})}
    />
  );

  return (
    <ProjectDashboardBacklogViewLayout
      overview={overview}
      content={content}
      error={error}
      isImmersiveView={isImmersiveView}
    />
  );
}
