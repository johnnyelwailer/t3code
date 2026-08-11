/* oxlint-disable react/no-unstable-nested-components -- Existing merged lint debt; keep green while preserving behavior. */
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { ProjectDashboardChildrenCards } from "~/t3team/t3team-ProjectDashboardChildrenCards";
import {
  ProjectDashboardKanbanDraggableCard,
  ProjectDashboardKanbanDroppableLane,
} from "~/t3team/t3team-ProjectDashboardKanbanDndUi";
import { TicketWorkItemCard } from "~/t3team/t3team-ProjectDashboardItemViews";
import type { ProjectDashboardKanbanOptimisticMove } from "~/t3team/t3team-projectDashboardKanbanDnd";
import {
  buildProjectDashboardKanbanLaneHierarchy,
  type TicketHierarchy,
} from "~/t3team/t3team-projectDashboardKanbanHierarchy";
import type { ProjectTicketKanbanColumn } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectDashboardKanbanLane({
  column,
  dragging,
  isHierarchyMode,
  parentChildGroups,
  jiraLastCheckedAt,
  projectId,
  onOpenTicket,
  onTicketContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
  optimisticMoves,
}: {
  column: ProjectTicketKanbanColumn;
  dragging: boolean;
  isHierarchyMode: boolean;
  parentChildGroups: TicketHierarchy;
  jiraLastCheckedAt?: number;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  optimisticMoves: Readonly<Record<string, ProjectDashboardKanbanOptimisticMove>>;
}) {
  const laneTicketIds = new Set(column.items.map((ticket) => ticket.id));
  const laneHierarchy = isHierarchyMode
    ? buildProjectDashboardKanbanLaneHierarchy(parentChildGroups, column.items)
    : null;
  const laneTickets = laneHierarchy
    ? [...laneHierarchy.roots, ...laneHierarchy.unresolvedChildren]
    : column.items;

  return (
    <ProjectDashboardKanbanDroppableLane
      columnId={column.id}
      title={column.title}
      count={column.items.length}
      dragging={dragging}
    >
      <div className="space-y-1.5">
        {laneTickets.map((ticket) => {
          const children = laneHierarchy?.childrenByParentId.get(ticket.id) ?? [];
          const isContextOnly = !laneTicketIds.has(ticket.id);
          const isPending = optimisticMoves[ticket.id]?.pending === true;

          return (
            <T3SurfacePanel
              key={ticket.id}
              tone="default"
              className="rounded-md bg-background/90 px-2.5 py-2"
            >
              <ProjectDashboardKanbanDraggableCard
                ticketId={ticket.id}
                disabled={!onMoveTicketToStatus || isContextOnly || isPending}
                pending={isPending}
              >
                <TicketWorkItemCard
                  ticket={ticket}
                  compact
                  flat
                  {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
                  {...(isHierarchyMode ? { childCount: children.length } : {})}
                  onContextMenu={(event) => onTicketContextMenu(event, ticket)}
                  extraChildren={renderTicketExtra ? renderTicketExtra(ticket, true) : null}
                  onOpen={() => onOpenTicket(projectId, ticket.id)}
                />
              </ProjectDashboardKanbanDraggableCard>
              {isHierarchyMode ? (
                <ProjectDashboardChildrenCards
                  tickets={children}
                  childrenByParentId={laneHierarchy?.childrenByParentId ?? new Map()}
                  {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
                  projectId={projectId}
                  onOpenTicket={onOpenTicket}
                  {...(renderTicketExtra ? { renderTicketExtra } : {})}
                  isContextOnlyTicket={(candidate) => !laneTicketIds.has(candidate.id)}
                  wrapTicketCard={({ ticket: child, isContextOnly: contextOnly, card }) => (
                    <ProjectDashboardKanbanDraggableCard
                      ticketId={child.id}
                      disabled={
                        !onMoveTicketToStatus ||
                        contextOnly ||
                        optimisticMoves[child.id]?.pending === true
                      }
                      pending={optimisticMoves[child.id]?.pending === true}
                    >
                      {card}
                    </ProjectDashboardKanbanDraggableCard>
                  )}
                />
              ) : null}
            </T3SurfacePanel>
          );
        })}
      </div>
    </ProjectDashboardKanbanDroppableLane>
  );
}
