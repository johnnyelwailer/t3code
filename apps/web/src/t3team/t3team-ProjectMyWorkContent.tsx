import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { useTicketAgentContext } from "~/t3team/hooks/t3team-useTicketAgentContext";
import {
  ProjectDashboardKanban,
  type TicketHierarchy,
} from "~/t3team/t3team-ProjectDashboardKanban";
import type { KanbanZoomLevel } from "~/t3team/t3team-kanbanZoom";
import { ProjectMyWorkHierarchyView } from "~/t3team/t3team-ProjectMyWorkHierarchyView";
import { ProjectMyWorkSimpleViews } from "~/t3team/t3team-ProjectMyWorkSimpleViews";
import { ProjectMyWorkLoadFailure } from "~/t3team/t3team-ProjectMyWorkLoadFailure";
import { ProjectMyWorkTableView } from "~/t3team/t3team-ProjectMyWorkTableView";
import {
  ProjectMyWorkLoadingState,
  resolveProjectMyWorkContentState,
  type ProjectMyWorkLoadStatus,
} from "~/t3team/t3team-projectMyWorkContentState";
import {
  buildProjectMyWorkTableRows,
  renderProjectMyWorkTicketExtra,
} from "~/t3team/t3team-projectMyWorkContentHelpers";
import { ProjectMyWorkDigestContent } from "~/t3team/t3team-ProjectMyWorkDigestContent";
import type { DigestFilterState } from "~/t3team/t3team-projectMyWorkDigestTypes";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import type { ProjectDashboardKanbanColumnCollapse } from "~/t3team/t3team-projectDashboardKanbanCollapse";
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
  loadStatus,
  project,
  tickets,
  assignedWorkItems,
  filteredWorkItems,
  visibleHierarchy,
  lens,
  viewMode,
  groupMode,
  tableSortBy,
  tableSortDirection,
  kanbanColumns,
  parentChildGroups,
  kanbanZoomLevel,
  onKanbanZoomLevelChange,
  githubActivityByWorkItem,
  jiraLastCheckedAt,
  digestFilters,
  columnCollapse,
  onTableSortByChange,
  onTableSortDirectionChange,
  onMoveTicketToStatus,
  onOpenTicket,
}: {
  loading: boolean;
  loadStatus?: ProjectMyWorkLoadStatus;
  project: ProjectShellProject;
  tickets: readonly ProjectTicket[];
  assignedWorkItems: readonly ProjectTicket[];
  filteredWorkItems: readonly ProjectTicket[];
  visibleHierarchy: ProjectMyWorkVisibleHierarchy;
  lens: ProjectMyWorkLens;
  viewMode: "table" | "list" | "grid" | "kanban";
  groupMode: "flat" | "hierarchy";
  tableSortBy: ProjectMyWorkTableSortBy;
  tableSortDirection: ProjectMyWorkTableSortDirection;
  kanbanColumns: ProjectTicketKanbanColumns;
  parentChildGroups: TicketHierarchy;
  kanbanZoomLevel?: KanbanZoomLevel;
  onKanbanZoomLevelChange?: (level: KanbanZoomLevel) => void;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  jiraLastCheckedAt?: number;
  digestFilters?: DigestFilterState | undefined;
  columnCollapse?: ProjectDashboardKanbanColumnCollapse;
  onTableSortByChange: (value: ProjectMyWorkTableSortBy) => void;
  onTableSortDirectionChange: (value: ProjectMyWorkTableSortDirection) => void;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { getTicketAgentContext, openTicketAgentContextMenu } = useTicketAgentContext({
    project,
    projectTickets: tickets,
    githubActivityByWorkItem,
  });
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
    ...loadStatus,
  });
  const renderTicketExtra = (ticket: ProjectTicket, compact?: boolean) =>
    renderProjectMyWorkTicketExtra({ ticket, compact, githubActivityByWorkItem });

  const renderBody = () => {
    // The digest lens has its own server-aggregated data and its own loading/empty states, so it
    // must not wait on (or be hidden by) the legacy assigned-items fetch. The key forces a fresh
    // mount (and therefore a fresh digest fetch) when the active project changes in the sidebar.
    if (lens === "digest") {
      return (
        <ProjectMyWorkDigestContent
          key={project.id}
          project={project}
          onOpenTicket={onOpenTicket}
          digestFilters={digestFilters}
        />
      );
    }

    if (contentState.kind === "sessionExpired" || contentState.kind === "error") {
      return <ProjectMyWorkLoadFailure state={contentState} onRetry={loadStatus?.onRetry} />;
    }

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

    // The lens decides the layout: the Hierarchy lens is the tree even though the default
    // view mode is still "kanban", so `?myWorkLens=hierarchy` never renders a board.
    if (lens === "board" || (viewMode === "kanban" && lens !== "hierarchy")) {
      return (
        <ProjectDashboardKanban
          kanbanColumns={kanbanColumns}
          allTickets={tickets}
          isHierarchyMode={groupMode === "hierarchy"}
          parentChildGroups={parentChildGroups}
          {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
          projectId={project.id}
          {...(kanbanZoomLevel !== undefined ? { kanbanZoomLevel } : {})}
          {...(onKanbanZoomLevelChange ? { onKanbanZoomLevelChange } : {})}
          onOpenTicket={onOpenTicket}
          onTicketContextMenu={openTicketAgentContextMenu}
          renderTicketExtra={renderTicketExtra}
          {...(columnCollapse ? { columnCollapse } : {})}
          {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
        />
      );
    }

    if (viewMode === "table" && lens !== "hierarchy") {
      return (
        <ProjectMyWorkTableView
          projectId={project.id}
          rows={tableRows}
          sortBy={tableSortBy}
          sortDirection={tableSortDirection}
          onSortByChange={onTableSortByChange}
          onSortDirectionChange={onTableSortDirectionChange}
          onTicketContextMenu={openTicketAgentContextMenu}
          onOpenTicket={onOpenTicket}
        />
      );
    }

    // The Hierarchy lens renders the depth-indented tree even when the legacy view mode is
    // still "table". Table keeps winning over the older groupMode="hierarchy" switch.
    if (lens === "hierarchy" || isHierarchyMode) {
      return (
        <ProjectMyWorkHierarchyView
          projectId={project.id}
          viewMode={viewMode === "grid" ? "grid" : "list"}
          hierarchy={visibleHierarchy.hierarchy}
          contextByTicketId={visibleHierarchy.contextByTicketId}
          matchedTicketIds={visibleHierarchy.matchedTicketIds}
          sortBy={tableSortBy}
          sortDirection={tableSortDirection}
          {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
          onTicketContextMenu={openTicketAgentContextMenu}
          getTicketAgentContext={getTicketAgentContext}
          onOpenTicket={onOpenTicket}
          renderTicketExtra={(ticket, _isContextOnly, compact) =>
            renderTicketExtra(ticket, compact)
          }
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
  };

  return <div className="space-y-4">{renderBody()}</div>;
}
