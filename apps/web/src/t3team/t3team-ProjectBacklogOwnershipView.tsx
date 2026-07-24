import type { MouseEvent } from "react";
import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { ProjectBacklogRow } from "~/t3team/t3team-ProjectBacklogRow";
import type {
  ProjectBacklogOwnershipGroup,
  ProjectBacklogTicketContext,
} from "~/t3team/t3team-projectBacklogPresentation";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

export function ProjectBacklogOwnershipView({
  projectId,
  groups,
  contextByTicketId,
  estimateFieldLabel,
  canCreateSubtasks,
  onTicketContextMenu,
  getTicketAgentContext,
  onOpenTicket,
  onSearchAssignableUsers,
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
}: {
  projectId: string;
  groups: readonly ProjectBacklogOwnershipGroup[];
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
  estimateFieldLabel?: string;
  canCreateSubtasks: boolean;
  onTicketContextMenu: (event: MouseEvent, ticket: ProjectTicket) => void;
  getTicketAgentContext: (ticket: ProjectTicket) => AgentContextCapabilities | null;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onSearchAssignableUsers: (
    ticket: ProjectTicket,
    query?: string,
  ) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  onUpdateAssignee: (
    ticket: ProjectTicket,
    assignee: AtlassianAssignableUser | null,
  ) => Promise<void>;
  onUpdateEstimate: (ticket: ProjectTicket, estimateValue: number | null) => Promise<void>;
  onCreateSubtask: (
    ticket: ProjectTicket,
    subtask: ProjectBacklogSubtaskCreateInput,
  ) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {groups.map((group) => (
        <section
          key={group.id}
          className={`space-y-3 border-l-2 pl-3 ${
            group.label === "Unassigned" ? "border-dashed border-warning/45" : "border-border/70"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-2">
            <div>
              <div className="text-sm font-semibold">{group.label}</div>
              <div className="text-xs text-muted-foreground">
                {group.tickets.length} tickets in this ownership slice.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{group.tickets.length} total</Badge>
              <Badge variant={group.needsPlanCount > 0 ? "warning" : "success"}>
                {group.needsPlanCount} need plan
              </Badge>
              {group.withSubtasksCount > 0 ? (
                <Badge variant="outline">{group.withSubtasksCount} with subtasks</Badge>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {group.tickets.map((ticket) => {
              const context = contextByTicketId.get(ticket.id);
              return (
                <ProjectBacklogRow
                  key={ticket.id}
                  ticket={ticket}
                  canCreateSubtasks={canCreateSubtasks}
                  onOpen={() => onOpenTicket(projectId, ticket.id)}
                  onSearchAssignableUsers={onSearchAssignableUsers}
                  onUpdateAssignee={onUpdateAssignee}
                  onUpdateEstimate={onUpdateEstimate}
                  onCreateSubtask={onCreateSubtask}
                  capabilities={getTicketAgentContext(ticket)}
                  onContextMenu={(event) => onTicketContextMenu(event, ticket)}
                  planningState={context?.planningState}
                  ancestorPath={context?.ancestors.map((ancestor) => ancestor.ref.displayId)}
                  directChildCount={context?.directChildren.length ?? 0}
                  descendantCount={context?.descendantCount ?? 0}
                  {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
