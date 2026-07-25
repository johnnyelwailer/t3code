import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
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
  githubLastCheckedAt,
  showGitHubActivity,
  githubActivityByWorkItem,
  projectId,
  onOpenTicket,
  onTicketContextMenu,
  onGitHubActivityContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
}: {
  kanbanColumns: ProjectTicketKanbanColumns;
  allTickets?: readonly ProjectTicket[];
  isHierarchyMode: boolean;
  parentChildGroups: TicketHierarchy;
  jiraLastCheckedAt?: number;
  githubLastCheckedAt?: number;
  showGitHubActivity: boolean;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  onGitHubActivityContextMenu: (
    event: React.MouseEvent,
    ticket: ProjectTicket,
    item: GitHubWorkActivityItem,
  ) => void;
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
      {...(githubLastCheckedAt !== undefined ? { githubLastCheckedAt } : {})}
      showGitHubActivity={showGitHubActivity}
      githubActivityByWorkItem={githubActivityByWorkItem}
      projectId={projectId}
      onOpenTicket={onOpenTicket}
      onTicketContextMenu={onTicketContextMenu}
      onGitHubActivityContextMenu={onGitHubActivityContextMenu}
      {...(renderTicketExtra ? { renderTicketExtra } : {})}
      {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
    />
  );
}
