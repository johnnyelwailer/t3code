import { useCallback, useDeferredValue, useMemo, useRef } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useAtlassianCurrentUserDisplayName } from "~/t3work/hooks/t3work-useAtlassianCurrentUserDisplayName";
import { useProjectBacklog } from "~/t3work/hooks/t3work-useProjectBacklog";
import { useTicketAgentContext } from "~/t3work/hooks/t3work-useTicketAgentContext";
import { useProjectDashboardBacklogDerivedData } from "~/t3work/hooks/t3work-useProjectDashboardBacklogDerivedData";
import { useProjectDashboardBacklogState } from "~/t3work/hooks/t3work-useProjectDashboardBacklogState";
import { useProjectDashboardBacklogTableState } from "~/t3work/hooks/t3work-useProjectDashboardBacklogTableState";
import { ProjectDashboardBacklogContent } from "~/t3work/t3work-ProjectDashboardBacklogContent";
import { ProjectBacklogOverview } from "~/t3work/t3work-ProjectBacklogOverview";
import {
  buildBacklogNeedsMyActionOutcome,
  type T3workDashboardRecipeAction,
  useRegisterT3workDashboardRecipeActionHandler,
} from "~/t3work/t3work-dashboardRecipeActions";

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
    () => ({
      ...(backlogState.boardId ? { boardId: backlogState.boardId } : {}),
      ...(backlogState.sprintId ? { sprintId: backlogState.sprintId } : {}),
      ...(backlogState.filterId ? { filterId: backlogState.filterId } : {}),
    }),
    [backlogState.boardId, backlogState.filterId, backlogState.sprintId],
  );
  const onOpenTicketRef = useRef(onOpenTicket);
  onOpenTicketRef.current = onOpenTicket;
  const {
    tickets,
    capabilities,
    boards,
    sprints,
    savedFilters,
    loading,
    error,
    searchAssignableUsers,
    updateAssignee,
    updateEstimate,
    createSubtask,
    refreshBacklog,
  } = useProjectBacklog(project, {
    selection: requestedSelection,
    onSelectionChange: (selection) => {
      setBacklogState((current) => ({
        ...current,
        boardId: selection.boardId,
        sprintId: selection.sprintId,
        filterId: selection.filterId,
      }));
    },
  });
  const {
    assigneeOptions,
    filteredTickets,
    hierarchyPresentation,
    ownershipGroups,
    planningLanes,
  } = useProjectDashboardBacklogDerivedData({
    tickets,
    query: deferredQuery,
    focusFilter: backlogState.focusFilter,
    assigneeFilter: backlogState.assigneeFilter,
    currentUserDisplayName,
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
  useRegisterT3workDashboardRecipeActionHandler(
    useCallback(
      (action: T3workDashboardRecipeAction) => {
        if (action.kind !== "focus-needs-my-action") {
          return null;
        }

        const outcome = buildBacklogNeedsMyActionOutcome(backlogState, filteredTickets);
        if (!outcome) {
          return { applied: false };
        }

        setBacklogState(outcome.nextState);
        return { applied: true, promptText: outcome.promptText };
      },
      [backlogState, filteredTickets, setBacklogState],
    ),
  );

  const isTableView = backlogState.viewMode === "table";

  return (
    <div
      className={isTableView ? "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden" : "space-y-2"}
    >
      <ProjectBacklogOverview
        loading={loading}
        query={backlogState.query}
        onQueryChange={(query) => {
          setBacklogState((current) => ({ ...current, query }));
        }}
        assigneeFilter={backlogState.assigneeFilter}
        onAssigneeFilterChange={(assigneeFilter) => {
          setBacklogState((current) => ({ ...current, assigneeFilter }));
        }}
        assigneeOptions={assigneeOptions}
        savedFilters={savedFilters}
        selectedFilterId={backlogState.filterId}
        onFilterChange={(filterId) => {
          setBacklogState((current) => ({ ...current, filterId }));
        }}
        viewMode={backlogState.viewMode}
        onViewModeChange={(viewMode) => {
          setBacklogState((current) => ({ ...current, viewMode }));
        }}
        focusFilter={backlogState.focusFilter}
        onFocusFilterChange={(focusFilter) => {
          setBacklogState((current) => ({ ...current, focusFilter }));
        }}
        tableGroupBy={backlogState.tableGroupBy}
        onTableGroupByChange={(tableGroupBy) => {
          setBacklogState((current) => ({ ...current, tableGroupBy }));
        }}
        tableSortBy={backlogState.tableSortBy}
        onTableSortByChange={handleTableSortByChange}
        tableSortDirection={backlogState.tableSortDirection}
        onTableSortDirectionChange={handleTableSortDirectionChange}
        visibleTableColumns={backlogState.visibleTableColumns}
        onVisibleTableColumnsChange={handleVisibleTableColumnsChange}
        onCollapseTableGroups={requestCollapseTableGroups}
        onExpandTableGroups={requestExpandTableGroups}
        boards={boards}
        sprints={sprints}
        selectedBoardId={backlogState.boardId}
        selectedSprintId={backlogState.sprintId}
        onBoardChange={(boardId) => {
          setBacklogState((current) => ({ ...current, boardId, sprintId: undefined }));
        }}
        onSprintChange={(sprintId) => {
          setBacklogState((current) => ({ ...current, sprintId }));
        }}
        onRefreshData={() => {
          void refreshBacklog({ clearProjectCache: true });
        }}
      />

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <ProjectDashboardBacklogContent
        projectId={project.id}
        viewMode={backlogState.viewMode}
        loading={loading}
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
    </div>
  );
}
