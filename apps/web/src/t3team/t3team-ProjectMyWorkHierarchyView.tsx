import { useMemo, type ReactNode } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import {
  DraggableTicketWorkItemCard,
  DraggableTicketWorkItemRow,
} from "~/t3team/t3team-DraggableTicketWorkItems";
import type { ProjectBacklogTicketContext } from "~/t3team/t3team-projectBacklogPresentation";
import {
  buildSubtreeLastTouchedById,
  DEFAULT_PROJECT_MY_WORK_HIERARCHY_ORDER,
  getOrderedHierarchySiblings,
  type ProjectMyWorkHierarchyOrder,
} from "~/t3team/t3team-projectMyWorkHierarchyOrder";
import type { ProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectMyWorkHierarchyView({
  projectId,
  viewMode,
  hierarchy,
  contextByTicketId,
  matchedTicketIds,
  sortBy = DEFAULT_PROJECT_MY_WORK_HIERARCHY_ORDER.sortBy,
  sortDirection = DEFAULT_PROJECT_MY_WORK_HIERARCHY_ORDER.sortDirection,
  jiraLastCheckedAt,
  onTicketContextMenu,
  getTicketAgentContext,
  onOpenTicket,
  renderTicketExtra,
}: {
  projectId: string;
  viewMode: "grid" | "list";
  hierarchy: ProjectTicketHierarchy;
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
  matchedTicketIds: ReadonlySet<string>;
  /** Orders every sibling group; defaults to most recently touched first. */
  sortBy?: ProjectMyWorkHierarchyOrder["sortBy"];
  sortDirection?: ProjectMyWorkHierarchyOrder["sortDirection"];
  jiraLastCheckedAt?: number;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  getTicketAgentContext: (ticket: ProjectTicket) => AgentContextCapabilities | null;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  renderTicketExtra: (
    ticket: ProjectTicket,
    isContextOnly: boolean,
    compact?: boolean,
  ) => ReactNode;
}) {
  const lastTouchedById = useMemo(() => buildSubtreeLastTouchedById(hierarchy), [hierarchy]);
  const orderedSiblings = (parentId: string | null) =>
    getOrderedHierarchySiblings({
      hierarchy,
      parentId,
      order: { sortBy, sortDirection },
      lastTouchedById,
    });

  function renderListBranch(parentId: string | null, depth: number): ReactNode {
    const siblings = orderedSiblings(parentId);

    if (siblings.length === 0) {
      return null;
    }

    return (
      <div className={parentId ? "mt-2 space-y-2 border-l-2 border-border/60 pl-3" : "space-y-3"}>
        {siblings.map((ticket) => {
          const context = contextByTicketId.get(ticket.id);
          const isContextOnly = !matchedTicketIds.has(ticket.id);
          return (
            <div key={ticket.id}>
              <T3SurfacePanel tone={isContextOnly ? "soft" : "muted"} className="px-3 py-2.5">
                <DraggableTicketWorkItemRow
                  capabilities={getTicketAgentContext(ticket)}
                  dragLabel={`${ticket.ref.displayId} ${ticket.ref.title}`}
                  ticket={ticket}
                  child={depth > 0}
                  childCount={context?.directChildren.length ?? 0}
                  {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
                  onContextMenu={(event) => onTicketContextMenu(event, ticket)}
                  extraChildren={renderTicketExtra(ticket, isContextOnly, depth > 0)}
                  onOpen={() => onOpenTicket(projectId, ticket.id)}
                />
              </T3SurfacePanel>
              {renderListBranch(ticket.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  }

  function renderCardBranch(parentId: string | null, depth: number): ReactNode {
    const siblings = orderedSiblings(parentId);

    if (siblings.length === 0) {
      return null;
    }

    const containerClass = parentId
      ? "mt-2 ml-2 space-y-1.5 border-l-2 border-border/70 pl-2"
      : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

    return (
      <div className={containerClass}>
        {siblings.map((ticket) => {
          const context = contextByTicketId.get(ticket.id);
          const isContextOnly = !matchedTicketIds.has(ticket.id);
          return (
            <T3SurfacePanel
              key={ticket.id}
              tone={isContextOnly ? "soft" : "muted"}
              className="px-2.5 py-2"
            >
              <DraggableTicketWorkItemCard
                capabilities={getTicketAgentContext(ticket)}
                dragLabel={`${ticket.ref.displayId} ${ticket.ref.title}`}
                ticket={ticket}
                compact={depth > 0}
                flat
                child={depth > 0}
                childCount={context?.directChildren.length ?? 0}
                {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
                onContextMenu={(event) => onTicketContextMenu(event, ticket)}
                extraChildren={renderTicketExtra(ticket, isContextOnly, depth > 0)}
                onOpen={() => onOpenTicket(projectId, ticket.id)}
              />
              {renderCardBranch(ticket.id, depth + 1)}
            </T3SurfacePanel>
          );
        })}
      </div>
    );
  }

  if (viewMode === "list") {
    return <div className="space-y-3">{renderListBranch(null, 0)}</div>;
  }

  return <div className="space-y-3">{renderCardBranch(null, 0)}</div>;
}
