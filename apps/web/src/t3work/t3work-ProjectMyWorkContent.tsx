import { ProjectMyWorkEmptyState } from "~/t3work/t3work-ProjectMyWorkEmptyState";
import { useTicketAgentContext } from "~/t3work/hooks/t3work-useTicketAgentContext";
import {
  ProjectDashboardKanban,
  type TicketHierarchy,
} from "~/t3work/t3work-ProjectDashboardKanban";
import { ProjectMyWorkHierarchyView } from "~/t3work/t3work-ProjectMyWorkHierarchyView";
import { ProjectMyWorkSimpleViews } from "~/t3work/t3work-ProjectMyWorkSimpleViews";
import { ProjectMyWorkTableView } from "~/t3work/t3work-ProjectMyWorkTableView";
import {
  ProjectMyWorkLoadingState,
  resolveProjectMyWorkContentState,
} from "~/t3work/t3work-projectMyWorkContentState";
import {
  buildProjectMyWorkTableRows,
  renderProjectMyWorkTicketExtra,
} from "~/t3work/t3work-projectMyWorkContentHelpers";
import type {
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
} from "~/t3work/t3work-projectDashboardMyWorkState";
import type { ProjectMyWorkVisibleHierarchy } from "~/t3work/t3work-projectMyWork";
import type { ProjectTicketKanbanColumns } from "~/t3work/t3work-projectTicketStatus";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { ProjectShellProject } from "@t3tools/project-context";

export function ProjectMyWorkContent({
  loading,
  project,
  tickets,
  assignedWorkItems,
  filteredWorkItems,
  visibleHierarchy,
  viewMode,
  groupMode,
  showGitHubActivity,
  tableSortBy,
  tableSortDirection,
  kanbanColumns,
  parentChildGroups,
  githubActivityByWorkItem,
  jiraLastCheckedAt,
  githubLastCheckedAt,
  onTableSortByChange,
  onTableSortDirectionChange,
  onMoveTicketToStatus,
  onOpenTicket,
  onRefresh,
  onClearFilters,
}: {
  loading: boolean;
  project: ProjectShellProject;
  tickets: readonly ProjectTicket[];
  assignedWorkItems: readonly ProjectTicket[];
  filteredWorkItems: readonly ProjectTicket[];
  visibleHierarchy: ProjectMyWorkVisibleHierarchy;
  viewMode: "table" | "list" | "grid" | "kanban";
  groupMode: "flat" | "hierarchy";
  showGitHubActivity: boolean;
  tableSortBy: ProjectMyWorkTableSortBy;
  tableSortDirection: ProjectMyWorkTableSortDirection;
  kanbanColumns: ProjectTicketKanbanColumns;
  parentChildGroups: TicketHierarchy;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  jiraLastCheckedAt?: number;
  githubLastCheckedAt?: number;
  onTableSortByChange: (value: ProjectMyWorkTableSortBy) => void;
  onTableSortDirectionChange: (value: ProjectMyWorkTableSortDirection) => void;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
}) {
  const {
    getTicketAgentContext,
    getGitHubActivityAgentContext,
    openTicketAgentContextMenu,
    openGitHubActivityAgentContextMenu,
  } = useTicketAgentContext({ project, projectTickets: tickets, githubActivityByWorkItem });
  const isHierarchyMode = groupMode === "hierarchy" && viewMode !== "kanban";
  const tableRows = buildProjectMyWorkTableRows({
    isHierarchyMode,
    visibleHierarchy,
    filteredWorkItems,
  });
  const contentState = resolveProjectMyWorkContentState({
    loading,
    assignedWorkItemsCount: assignedWorkItems.length,
    filteredWorkItemsCount: filteredWorkItems.length,
  });
  const renderTicketExtra = (ticket: ProjectTicket, compact?: boolean) =>
    renderProjectMyWorkTicketExtra({
      ticket,
      compact,
      showGitHubActivity,
      githubActivityByWorkItem,
      githubLastCheckedAt,
      onGitHubActivityContextMenu: openGitHubActivityAgentContextMenu,
      getGitHubActivityDragCapabilities: getGitHubActivityAgentContext,
    });

  if (contentState.kind === "loading") {
    return <ProjectMyWorkLoadingState />;
  }

  if (contentState.kind === "empty") {
    return (
      <ProjectMyWorkEmptyState
        reason={contentState.reason}
        onRefresh={onRefresh}
        onClearFilters={onClearFilters}
      />
    );
  }

  if (viewMode === "table") {
    return (
      <ProjectMyWorkTableView
        projectId={project.id}
        rows={tableRows}
        showGitHubActivity={showGitHubActivity}
        sortBy={tableSortBy}
        sortDirection={tableSortDirection}
        githubActivityByWorkItem={githubActivityByWorkItem}
        {...(githubLastCheckedAt !== undefined ? { githubLastCheckedAt } : {})}
        onSortByChange={onTableSortByChange}
        onSortDirectionChange={onTableSortDirectionChange}
        onGitHubActivityContextMenu={openGitHubActivityAgentContextMenu}
        onTicketContextMenu={openTicketAgentContextMenu}
        onOpenTicket={onOpenTicket}
        getGitHubActivityDragCapabilities={(ticket, item) =>
          getGitHubActivityAgentContext(ticket, item)
        }
      />
    );
  }

  if (viewMode === "kanban") {
    return (
      <ProjectDashboardKanban
        kanbanColumns={kanbanColumns}
        allTickets={tickets}
        isHierarchyMode={groupMode === "hierarchy"}
        parentChildGroups={parentChildGroups}
        {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
        {...(githubLastCheckedAt !== undefined ? { githubLastCheckedAt } : {})}
        showGitHubActivity={showGitHubActivity}
        githubActivityByWorkItem={githubActivityByWorkItem}
        projectId={project.id}
        onOpenTicket={onOpenTicket}
        onTicketContextMenu={openTicketAgentContextMenu}
        onGitHubActivityContextMenu={openGitHubActivityAgentContextMenu}
        renderTicketExtra={renderTicketExtra}
        {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
      />
    );
  }

  if (isHierarchyMode) {
    return (
      <ProjectMyWorkHierarchyView
        projectId={project.id}
        viewMode={viewMode === "grid" ? "grid" : "list"}
        hierarchy={visibleHierarchy.hierarchy}
        contextByTicketId={visibleHierarchy.contextByTicketId}
        matchedTicketIds={visibleHierarchy.matchedTicketIds}
        {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
        onTicketContextMenu={openTicketAgentContextMenu}
        getTicketAgentContext={getTicketAgentContext}
        onOpenTicket={onOpenTicket}
        renderTicketExtra={(ticket, _isContextOnly, compact) => renderTicketExtra(ticket, compact)}
      />
    );
  }

  return (
    <ProjectMyWorkSimpleViews
      viewMode={viewMode === "list" ? "list" : "grid"}
      projectId={project.id}
      filteredWorkItems={filteredWorkItems}
      getTicketAgentContext={getTicketAgentContext}
      onTicketContextMenu={openTicketAgentContextMenu}
      jiraLastCheckedAt={jiraLastCheckedAt}
      renderTicketExtra={(ticket) => renderTicketExtra(ticket)}
      onOpenTicket={onOpenTicket}
    />
  );
}
