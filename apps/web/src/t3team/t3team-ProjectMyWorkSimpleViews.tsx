import type { MouseEvent, ReactNode } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import {
  DraggableTicketWorkItemCard,
  DraggableTicketWorkItemRow,
} from "~/t3team/t3team-DraggableTicketWorkItems";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectMyWorkSimpleViews({
  viewMode,
  projectId,
  filteredWorkItems,
  getTicketAgentContext,
  onTicketContextMenu,
  jiraLastCheckedAt,
  renderTicketExtra,
  onOpenTicket,
}: {
  viewMode: "list" | "grid";
  projectId: string;
  filteredWorkItems: readonly ProjectTicket[];
  getTicketAgentContext: (ticket: ProjectTicket) => AgentContextCapabilities | null;
  onTicketContextMenu: (event: MouseEvent, ticket: ProjectTicket) => void;
  jiraLastCheckedAt?: number | undefined;
  renderTicketExtra: (ticket: ProjectTicket) => ReactNode;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  if (viewMode === "list") {
    return (
      <T3SurfacePanel tone="muted" className="divide-y divide-border/70">
        {filteredWorkItems.map((ticket) => (
          <div key={ticket.id} className="px-3 py-2.5 transition-colors hover:bg-accent/30">
            <DraggableTicketWorkItemRow
              capabilities={getTicketAgentContext(ticket)}
              dragLabel={`${ticket.ref.displayId} ${ticket.ref.title}`}
              ticket={ticket}
              {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
              onContextMenu={(event) => onTicketContextMenu(event, ticket)}
              extraChildren={renderTicketExtra(ticket)}
              onOpen={() => onOpenTicket(projectId, ticket.id)}
            />
          </div>
        ))}
      </T3SurfacePanel>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filteredWorkItems.map((ticket) => (
        <T3SurfacePanel key={ticket.id} tone="muted" className="px-2.5 py-2">
          <DraggableTicketWorkItemCard
            capabilities={getTicketAgentContext(ticket)}
            dragLabel={`${ticket.ref.displayId} ${ticket.ref.title}`}
            ticket={ticket}
            flat
            {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
            onContextMenu={(event) => onTicketContextMenu(event, ticket)}
            extraChildren={renderTicketExtra(ticket)}
            onOpen={() => onOpenTicket(projectId, ticket.id)}
          />
        </T3SurfacePanel>
      ))}
    </div>
  );
}
