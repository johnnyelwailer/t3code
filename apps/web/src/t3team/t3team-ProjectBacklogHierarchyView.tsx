import type { MouseEvent } from "react";
import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { ProjectBacklogRow } from "~/t3team/t3team-ProjectBacklogRow";
import type {
  ProjectBacklogTicketContext,
  ProjectBacklogPlanningState,
} from "~/t3team/t3team-projectBacklogPresentation";
import { compareProjectBacklogTickets } from "~/t3team/t3team-projectBacklogUtils";
import type { ProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

function sortTickets(tickets: readonly ProjectTicket[], matchedTicketIds: ReadonlySet<string>) {
  return tickets.toSorted((left, right) => {
    const matchedDelta =
      Number(matchedTicketIds.has(right.id)) - Number(matchedTicketIds.has(left.id));
    if (matchedDelta !== 0) return matchedDelta;
    return compareProjectBacklogTickets(left, right);
  });
}

export function ProjectBacklogHierarchyView({
  projectId,
  hierarchy,
  contextByTicketId,
  matchedTicketIds,
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
  hierarchy: ProjectTicketHierarchy;
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
  matchedTicketIds: ReadonlySet<string>;
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
  function renderBranch(parentId: string | null): React.ReactNode {
    const siblings = sortTickets(
      parentId ? (hierarchy.childrenByParentId.get(parentId) ?? []) : hierarchy.roots,
      matchedTicketIds,
    );

    if (siblings.length === 0) {
      return null;
    }

    return (
      <div className={parentId ? "mt-3 space-y-3 border-l border-border/60 pl-4" : "space-y-4"}>
        {siblings.map((ticket) => {
          const context = contextByTicketId.get(ticket.id);
          return (
            <div key={ticket.id}>
              <ProjectBacklogRow
                ticket={ticket}
                canCreateSubtasks={canCreateSubtasks}
                onOpen={() => onOpenTicket(projectId, ticket.id)}
                onSearchAssignableUsers={onSearchAssignableUsers}
                onUpdateAssignee={onUpdateAssignee}
                onUpdateEstimate={onUpdateEstimate}
                onCreateSubtask={onCreateSubtask}
                capabilities={getTicketAgentContext(ticket)}
                onContextMenu={(event) => onTicketContextMenu(event, ticket)}
                planningState={context?.planningState as ProjectBacklogPlanningState | undefined}
                ancestorPath={context?.ancestors.map((ancestor) => ancestor.ref.displayId)}
                directChildCount={context?.directChildren.length ?? 0}
                descendantCount={context?.descendantCount ?? 0}
                isContextOnly={!matchedTicketIds.has(ticket.id)}
                {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
              />
              {renderBranch(ticket.id)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/18 px-3 py-2 text-xs text-muted-foreground">
        <Badge variant="outline">{hierarchy.roots.length} root issues</Badge>
        {hierarchy.unresolvedChildren.length > 0 ? (
          <Badge variant="warning">{hierarchy.unresolvedChildren.length} loose child issues</Badge>
        ) : null}
        <span>
          Parents remain visible when children match your filters so planning context stays intact.
        </span>
      </div>

      {renderBranch(null)}

      {hierarchy.unresolvedChildren.length > 0 ? (
        <section className="space-y-3 border-t border-dashed border-warning/40 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Loose child issues</div>
              <div className="text-xs text-muted-foreground">
                These issues look like subtasks but Jira did not expose a resolvable parent.
              </div>
            </div>
            <Badge variant="warning">Needs hierarchy cleanup</Badge>
          </div>
          <div className="space-y-3">
            {sortTickets(hierarchy.unresolvedChildren, matchedTicketIds).map((ticket) => {
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
                  planningState={context?.planningState as ProjectBacklogPlanningState | undefined}
                  directChildCount={context?.directChildren.length ?? 0}
                  descendantCount={context?.descendantCount ?? 0}
                  isContextOnly={!matchedTicketIds.has(ticket.id)}
                  {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
