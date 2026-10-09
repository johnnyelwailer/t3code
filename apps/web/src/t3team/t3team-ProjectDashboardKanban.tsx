import { ProjectDashboardKanbanBoard } from "~/t3team/t3team-ProjectDashboardKanbanBoard";
import type { KanbanZoomLevel } from "~/t3team/t3team-kanbanZoom";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type { ProjectDashboardKanbanColumnCollapse } from "~/t3team/t3team-projectDashboardKanbanCollapse";
import type { TicketHierarchy } from "~/t3team/t3team-projectDashboardKanbanHierarchy";
import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";

export type { TicketHierarchy } from "~/t3team/t3team-projectDashboardKanbanHierarchy";
export { buildProjectDashboardKanbanLaneHierarchy } from "~/t3team/t3team-projectDashboardKanbanHierarchy";

export function ProjectDashboardKanban({
  kanbanColumns,
  allTickets,
  isHierarchyMode,
  parentChildGroups,
  jiraLastCheckedAt,
  projectId,
  kanbanZoomLevel,
  onKanbanZoomLevelChange,
  onOpenTicket,
  onTicketContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
  columnCollapse,
}: {
  kanbanColumns: ProjectTicketKanbanColumns;
  allTickets?: readonly ProjectTicket[];
  isHierarchyMode: boolean;
  parentChildGroups: TicketHierarchy;
  jiraLastCheckedAt?: number;
  projectId: string;
  kanbanZoomLevel?: KanbanZoomLevel;
  onKanbanZoomLevelChange?: (level: KanbanZoomLevel) => void;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  columnCollapse?: ProjectDashboardKanbanColumnCollapse;
}) {
  return (
    <ProjectDashboardKanbanBoard
      kanbanColumns={kanbanColumns}
      {...(allTickets ? { allTickets } : {})}
      isHierarchyMode={isHierarchyMode}
      parentChildGroups={parentChildGroups}
      {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
      projectId={projectId}
      {...(kanbanZoomLevel !== undefined ? { kanbanZoomLevel } : {})}
      {...(onKanbanZoomLevelChange ? { onKanbanZoomLevelChange } : {})}
      onOpenTicket={onOpenTicket}
      onTicketContextMenu={onTicketContextMenu}
      {...(renderTicketExtra ? { renderTicketExtra } : {})}
      {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
      {...(columnCollapse ? { columnCollapse } : {})}
    />
  );
}
