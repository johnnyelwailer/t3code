import { useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useProjectKanbanBoardColumns } from "~/t3team/hooks/t3team-useProjectKanbanBoardColumns";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import {
  buildAssignedWorkItems,
  buildVisibleMyWorkHierarchy,
} from "~/t3team/hooks/t3team-projectKanbanDerivedData";
import { ProjectDashboardKanban } from "~/t3team/t3team-ProjectDashboardKanban";
import { buildProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

/** The roll-up is read-only: no ticket moves, no agent context menu. */
const NOOP_TICKET_CONTEXT_MENU = () => undefined;

/**
 * Read-only per-project board: the roll-up never moves tickets. Grouped like the per-project
 * board — the page's parent-context rows head their children's groups instead of taking lane slots.
 */
export function AllProjectsMyWorkBoard({
  project,
  tickets,
  viewerAccountId,
  lastCheckedAt,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  tickets: readonly ProjectTicket[];
  viewerAccountId?: string;
  lastCheckedAt?: number;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { boardColumns, availableStatuses } = useProjectKanbanBoardColumns(project);
  const profileId = useMemo(() => readProjectSetupProfileIdFromProject(project), [project]);
  const assignedTickets = useMemo(
    () =>
      viewerAccountId ? buildAssignedWorkItems(tickets, { accountId: viewerAccountId }) : tickets,
    [tickets, viewerAccountId],
  );
  const kanbanColumns = useMemo(
    () =>
      buildProjectTicketKanbanColumns(assignedTickets, {
        profileId,
        availableStatuses,
        boardColumns,
      }),
    [assignedTickets, availableStatuses, boardColumns, profileId],
  );
  const parentChildGroups = useMemo(
    () => buildVisibleMyWorkHierarchy(tickets, assignedTickets, "updated", "desc", []).hierarchy,
    [assignedTickets, tickets],
  );
  return (
    <ProjectDashboardKanban
      kanbanColumns={kanbanColumns}
      allTickets={tickets}
      isHierarchyMode
      parentChildGroups={parentChildGroups}
      {...(lastCheckedAt !== undefined ? { jiraLastCheckedAt: lastCheckedAt } : {})}
      projectId={project.id}
      onOpenTicket={onOpenTicket}
      onTicketContextMenu={NOOP_TICKET_CONTEXT_MENU}
    />
  );
}
