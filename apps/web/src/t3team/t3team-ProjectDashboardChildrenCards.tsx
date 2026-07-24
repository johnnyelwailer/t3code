import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { DraggableTicketWorkItemCard } from "~/t3team/t3team-DraggableTicketWorkItems";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectDashboardChildrenCards({
  tickets,
  childrenByParentId,
  jiraLastCheckedAt,
  projectId,
  onOpenTicket,
  renderTicketExtra,
  isContextOnlyTicket,
  getTicketAgentContext,
  wrapTicketCard,
}: {
  tickets: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  jiraLastCheckedAt?: number;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  isContextOnlyTicket?: (ticket: ProjectTicket) => boolean;
  getTicketAgentContext?: (ticket: ProjectTicket) => AgentContextCapabilities | null;
  wrapTicketCard?: (input: {
    ticket: ProjectTicket;
    isContextOnly: boolean;
    card: React.ReactNode;
  }) => React.ReactNode;
}) {
  if (tickets.length === 0) return null;

  return (
    <T3SurfacePanel tone="inset" className="mt-2 ml-2 rounded-md px-2 py-1.5">
      <div className="space-y-1.5 border-l-2 border-border/70 pl-2">
        {tickets.map((child) => {
          const nestedChildren = childrenByParentId.get(child.id) ?? [];
          const isContextOnly = isContextOnlyTicket?.(child) ?? false;
          const card = (
            <DraggableTicketWorkItemCard
              capabilities={getTicketAgentContext?.(child) ?? null}
              dragLabel={`${child.ref.displayId} ${child.ref.title}`}
              ticket={child}
              compact
              flat
              child
              {...(nestedChildren.length > 0 ? { childCount: nestedChildren.length } : {})}
              {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
              extraChildren={renderTicketExtra?.(child, true)}
              onOpen={() => onOpenTicket(projectId, child.id)}
            />
          );

          return (
            <div key={child.id}>
              {wrapTicketCard ? wrapTicketCard({ ticket: child, isContextOnly, card }) : card}
              {nestedChildren.length > 0 ? (
                <ProjectDashboardChildrenCards
                  tickets={nestedChildren}
                  childrenByParentId={childrenByParentId}
                  {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
                  projectId={projectId}
                  onOpenTicket={onOpenTicket}
                  {...(renderTicketExtra ? { renderTicketExtra } : {})}
                  {...(isContextOnlyTicket ? { isContextOnlyTicket } : {})}
                  {...(getTicketAgentContext ? { getTicketAgentContext } : {})}
                  {...(wrapTicketCard ? { wrapTicketCard } : {})}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </T3SurfacePanel>
  );
}
