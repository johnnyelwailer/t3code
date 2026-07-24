import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { useTicketAgentContext } from "~/t3team/hooks/t3team-useTicketAgentContext";
import {
  ProjectDashboardKanban,
  type TicketHierarchy,
} from "~/t3team/t3team-ProjectDashboardKanban";
import { ProjectMyWorkHierarchyView } from "~/t3team/t3team-ProjectMyWorkHierarchyView";
import { ProjectMyWorkSimpleViews } from "~/t3team/t3team-ProjectMyWorkSimpleViews";
import { ProjectMyWorkTableView } from "~/t3team/t3team-ProjectMyWorkTableView";
import {
  ProjectMyWorkLoadingState,
  resolveProjectMyWorkContentState,
} from "~/t3team/t3team-projectMyWorkContentState";
import {
  buildProjectMyWorkTableRows,
  renderProjectMyWorkTicketExtra,
} from "~/t3team/t3team-projectMyWorkContentHelpers";
import type {
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectMyWorkVisibleHierarchy } from "~/t3team/t3team-projectMyWork";
import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectTicket } from "~/t3team/t3team-types";
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
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        {contentState.message}
      </T3SurfacePanel>
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
