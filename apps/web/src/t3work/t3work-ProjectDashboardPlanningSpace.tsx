/**
 * Adapter that mounts the PlanningSpaceView from backlog dashboard state —
 * translates planning-space mutations (assign / set hours / create subtask) and
 * context-menu callbacks back into the backlog ticket operations. Split out of
 * t3work-ProjectDashboardBacklogContent.tsx.
 */

import type { MouseEvent } from "react";

import type { AtlassianAssignableUser } from "~/t3work/backend/t3work-types";
import { PlanningSpaceView } from "~/t3work/planning-space/t3work-PlanningSpaceView";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3work/t3work-types";

export function ProjectDashboardPlanningSpace({
  filteredTickets,
  ownerCapacities,
  selectedSprintId,
  currentUserAccountId,
  currentUserDisplayName,
  canCreateSubtasks,
  shellClass,
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
  onTicketContextMenu,
}: {
  filteredTickets: readonly ProjectTicket[];
  ownerCapacities?: ReadonlyMap<string, number> | undefined;
  selectedSprintId?: string | undefined;
  currentUserAccountId?: string | undefined;
  currentUserDisplayName?: string | undefined;
  canCreateSubtasks: boolean;
  shellClass?: string | undefined;
  onUpdateAssignee: (
    ticket: ProjectTicket,
    assignee: AtlassianAssignableUser | null,
  ) => Promise<void>;
  onUpdateEstimate: (ticket: ProjectTicket, estimateValue: number | null) => Promise<void>;
  onCreateSubtask: (
    ticket: ProjectTicket,
    subtask: ProjectBacklogSubtaskCreateInput,
  ) => Promise<void>;
  onTicketContextMenu: (event: MouseEvent, ticket: ProjectTicket) => void;
}) {
  const ticketById = (id: string) => filteredTickets.find((t) => t.id === id);
  return (
    <div className={shellClass}>
      <PlanningSpaceView
        tickets={filteredTickets}
        ownerCapacities={ownerCapacities}
        {...(selectedSprintId ? { sprintId: selectedSprintId } : {})}
        {...(currentUserAccountId || currentUserDisplayName
          ? {
              currentUser: {
                ...(currentUserAccountId ? { accountId: currentUserAccountId } : {}),
                ...(currentUserDisplayName ? { displayName: currentUserDisplayName } : {}),
              },
            }
          : {})}
        mutations={{
          onAssign: (item, ownerId) => {
            const ticket = ticketById(item.kind === "story" ? item.storyId : item.subtaskId);
            if (!ticket) return;
            const displayName =
              filteredTickets.find((t) => t.assigneeAccountId === ownerId)?.assignee ?? ownerId;
            void onUpdateAssignee(
              ticket,
              ownerId === null ? null : { accountId: ownerId, displayName: displayName ?? ownerId },
            );
          },
          onSetSubtaskHours: (subtaskId, seconds) => {
            const ticket = ticketById(subtaskId);
            if (!ticket) return;
            // Hour-tracked tickets store the estimate in hours (the same value
            // the backlog estimate cell edits).
            void onUpdateEstimate(ticket, seconds > 0 ? seconds / 3600 : null);
          },
          onCreateSubtask: canCreateSubtasks
            ? (storyId, title) => {
                const ticket = ticketById(storyId);
                if (!ticket) return;
                void onCreateSubtask(ticket, { summary: title });
              }
            : undefined,
        }}
        onTicketContextMenu={
          onTicketContextMenu
            ? (event, ticketId) => {
                const ticket = filteredTickets.find((t) => t.id === ticketId);
                if (ticket) onTicketContextMenu(event, ticket);
              }
            : undefined
        }
      />
    </div>
  );
}
