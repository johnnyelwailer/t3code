import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";

import { ProjectDashboardPlanningSpace } from "~/t3team/t3team-ProjectDashboardPlanningSpace";
import { ProjectBacklogHierarchyView } from "~/t3team/t3team-ProjectBacklogHierarchyView";
import { ProjectBacklogOwnershipView } from "~/t3team/t3team-ProjectBacklogOwnershipView";
import { ProjectBacklogPlanningView } from "~/t3team/t3team-ProjectBacklogPlanningView";
import { ProjectBacklogTableView } from "~/t3team/t3team-ProjectBacklogTableView";
import { isProjectBacklogImmersiveViewMode } from "~/t3team/t3team-projectBacklogPresentationMeta";
import type { ProjectDashboardBacklogContentProps } from "~/t3team/t3team-projectDashboardBacklogContentProps";

export function ProjectDashboardBacklogContent({
  projectId,
  viewMode,
  loading,
  filteredTickets,
  hierarchy,
  contextByTicketId,
  matchedTicketIds,
  planningLanes,
  ownershipGroups,
  tableGroupBy,
  tableSortBy,
  tableSortDirection,
  visibleTableColumns,
  collapseGroupsRequestKey,
  expandGroupsRequestKey,
  canCreateSubtasks,
  estimateFieldLabel,
  onTicketContextMenu,
  getTicketAgentContext,
  onOpenTicket,
  onSearchAssignableUsers,
  onListChildIssueTypes,
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
  onTableSortByChange,
  onTableSortDirectionChange,
  selectedSprintId,
  currentUserAccountId,
  currentUserDisplayName,
  ownerCapacities,
}: ProjectDashboardBacklogContentProps) {
  const isImmersiveView = isProjectBacklogImmersiveViewMode(viewMode);
  const immersiveShellClass = isImmersiveView
    ? "flex min-h-0 flex-1 flex-col overflow-hidden"
    : undefined;

  const actionProps = {
    canCreateSubtasks,
    onOpenTicket,
    onSearchAssignableUsers,
    onUpdateAssignee,
    onUpdateEstimate,
    onCreateSubtask,
    ...(onListChildIssueTypes ? { onListChildIssueTypes } : {}),
    ...(estimateFieldLabel ? { estimateFieldLabel } : {}),
  };

  if (loading && filteredTickets.length === 0) {
    return (
      <div
        className={
          isImmersiveView
            ? "flex flex-1 flex-col border-t border-border/70 bg-background/70 p-4 sm:p-5"
            : "rounded-lg border border-border/70 bg-background/70 p-4 sm:p-5"
        }
      >
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-[92%]" />
          <Skeleton className="h-10 w-[84%]" />
          <Skeleton className="h-10 w-[88%]" />
        </div>
      </div>
    );
  }

  if (!loading && filteredTickets.length === 0) {
    return (
      <div
        className={
          isImmersiveView
            ? "flex flex-1 items-center justify-center border-t border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground"
            : "rounded-lg border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground"
        }
      >
        No backlog items match your current search and planning filter.
      </div>
    );
  }

  if (viewMode === "planning-space") {
    return (
      <ProjectDashboardPlanningSpace
        filteredTickets={filteredTickets}
        ownerCapacities={ownerCapacities}
        selectedSprintId={selectedSprintId}
        currentUserAccountId={currentUserAccountId}
        currentUserDisplayName={currentUserDisplayName}
        canCreateSubtasks={canCreateSubtasks}
        shellClass={immersiveShellClass}
        onUpdateAssignee={onUpdateAssignee}
        onUpdateEstimate={onUpdateEstimate}
        onCreateSubtask={onCreateSubtask}
        onTicketContextMenu={onTicketContextMenu}
      />
    );
  }

  if (viewMode === "hierarchy") {
    return (
      <ProjectBacklogHierarchyView
        projectId={projectId}
        hierarchy={hierarchy}
        contextByTicketId={contextByTicketId}
        matchedTicketIds={matchedTicketIds}
        onTicketContextMenu={onTicketContextMenu}
        getTicketAgentContext={getTicketAgentContext}
        {...actionProps}
      />
    );
  }

  if (viewMode === "planning") {
    return (
      <ProjectBacklogPlanningView
        projectId={projectId}
        lanes={planningLanes}
        contextByTicketId={contextByTicketId}
        onTicketContextMenu={onTicketContextMenu}
        getTicketAgentContext={getTicketAgentContext}
        {...actionProps}
      />
    );
  }

  if (viewMode === "table") {
    return (
      <div className={immersiveShellClass}>
        <ProjectBacklogTableView
          projectId={projectId}
          tickets={filteredTickets}
          contextByTicketId={contextByTicketId}
          groupBy={tableGroupBy}
          sortBy={tableSortBy}
          sortDirection={tableSortDirection}
          visibleColumns={visibleTableColumns}
          collapseGroupsRequestKey={collapseGroupsRequestKey}
          expandGroupsRequestKey={expandGroupsRequestKey}
          onTicketContextMenu={onTicketContextMenu}
          getTicketAgentContext={getTicketAgentContext}
          onSortByChange={onTableSortByChange}
          onSortDirectionChange={onTableSortDirectionChange}
          {...actionProps}
        />
      </div>
    );
  }

  return (
    <ProjectBacklogOwnershipView
      projectId={projectId}
      groups={ownershipGroups}
      contextByTicketId={contextByTicketId}
      onTicketContextMenu={onTicketContextMenu}
      getTicketAgentContext={getTicketAgentContext}
      {...actionProps}
    />
  );
}
