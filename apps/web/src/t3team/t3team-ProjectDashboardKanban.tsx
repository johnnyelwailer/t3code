import { ProjectDashboardKanbanBoard } from "~/t3team/t3team-ProjectDashboardKanbanBoard";
import type { ProjectTicket } from "~/t3team/t3team-types";
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
  onOpenTicket,
  onTicketContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
}: {
  kanbanColumns: ProjectTicketKanbanColumns;
  allTickets?: readonly ProjectTicket[];
  isHierarchyMode: boolean;
  parentChildGroups: TicketHierarchy;
  jiraLastCheckedAt?: number;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
}) {
  return (
    <ProjectDashboardKanbanBoard
      kanbanColumns={kanbanColumns}
      {...(allTickets ? { allTickets } : {})}
      isHierarchyMode={isHierarchyMode}
      parentChildGroups={parentChildGroups}
      {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
      projectId={projectId}
      onOpenTicket={onOpenTicket}
      onTicketContextMenu={onTicketContextMenu}
      {...(renderTicketExtra ? { renderTicketExtra } : {})}
      {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
    />
  );
}
