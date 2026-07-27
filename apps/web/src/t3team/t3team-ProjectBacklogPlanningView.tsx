import type { MouseEvent } from "react";
import type { AtlassianAssignableUser, AtlassianChildIssueType } from "~/t3team/backend/t3team-types";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { ProjectBacklogRow } from "~/t3team/t3team-ProjectBacklogRow";
import type {
  ProjectBacklogPlanningLane,
  ProjectBacklogTicketContext,
} from "~/t3team/t3team-projectBacklogPresentation";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

const laneClasses: Record<string, string> = {
  "needs-owner-and-estimate": "border-warning/45",
  "needs-owner": "border-info/45",
  "needs-estimate": "border-secondary/70",
  ready: "border-success/45",
};

export function ProjectBacklogPlanningView({
  projectId,
  lanes,
  contextByTicketId,
  estimateFieldLabel,
  canCreateSubtasks,
  onTicketContextMenu,
  getTicketAgentContext,
  onOpenTicket,
  onSearchAssignableUsers,
  onListChildIssueTypes,
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
}: {
  projectId: string;
  lanes: readonly ProjectBacklogPlanningLane[];
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
  onListChildIssueTypes?: () => Promise<ReadonlyArray<AtlassianChildIssueType>>;
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
    <div className="grid gap-4 2xl:grid-cols-4 xl:grid-cols-2">
      {lanes.map((lane) => (
        <section key={lane.id} className={`space-y-3 border-l-2 pl-3 ${laneClasses[lane.id]}`}>
          <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-2">
            <div>
              <div className="text-sm font-semibold">{lane.label}</div>
              <div className="text-xs text-muted-foreground">{lane.description}</div>
            </div>
            <Badge variant="outline">{lane.tickets.length}</Badge>
          </div>
          {lane.tickets.length > 0 ? (
            <div className="space-y-3">
              {lane.tickets.map((ticket) => {
                const context = contextByTicketId.get(ticket.id);
                return (
                  <ProjectBacklogRow
                    key={ticket.id}
                    ticket={ticket}
                    canCreateSubtasks={canCreateSubtasks}
                    onOpen={() => onOpenTicket(projectId, ticket.id)}
                    onSearchAssignableUsers={onSearchAssignableUsers}
                    {...(onListChildIssueTypes ? { onListChildIssueTypes } : {})}
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
          ) : (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
              No tickets in this planning bucket.
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
