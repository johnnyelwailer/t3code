import { useCallback } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function useProjectKanbanStatusMutation({
  project,
  reloadTickets,
}: {
  project: ProjectShellProject;
  reloadTickets: () => Promise<void>;
}) {
  const backend = useBackend();
  const canMoveTickets =
    backend !== null &&
    project.source.provider === "atlassian" &&
    typeof project.source.accountId === "string" &&
    project.source.accountId.trim().length > 0;

  const moveTicketToStatus = useCallback(
    async (ticket: ProjectTicket, targetStatus: string): Promise<string> => {
      if (!backend || !project.source.accountId) {
        throw new Error("Kanban status changes require a live Atlassian connection.");
      }

      const result = await backend.atlassian.updateIssueStatus({
        accountId: project.source.accountId,
        issueIdOrKey: ticket.id,
        targetStatus,
      });

      void reloadTickets().catch(() => undefined);
      return result.status;
    },
    [backend, project.source.accountId, reloadTickets],
  );

  return { canMoveTickets, moveTicketToStatus };
}
