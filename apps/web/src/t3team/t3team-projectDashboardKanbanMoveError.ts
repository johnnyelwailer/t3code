import type { ProjectTicket } from "~/t3team/t3team-types";

export type ProjectDashboardKanbanMoveError = {
  readonly title: string;
  readonly description: string;
};

export function buildProjectDashboardKanbanMoveError(input: {
  ticket: ProjectTicket;
  targetStatus: string;
  error: unknown;
}): ProjectDashboardKanbanMoveError {
  const ticketLabel = input.ticket.ref.displayId || input.ticket.id;
  const targetLabel = input.targetStatus.trim() || "the requested lane";
  const detail =
    input.error instanceof Error ? input.error.message : "Failed to update Jira status.";

  return {
    title: `Couldn't move ${ticketLabel} to ${targetLabel}`,
    description: detail,
  };
}
