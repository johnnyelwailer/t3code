/* oxlint-disable react/no-unstable-nested-components -- Existing merged lint debt; keep green while preserving behavior. */
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { ProjectDashboardChildrenCards } from "~/t3team/t3team-ProjectDashboardChildrenCards";
import {
  ProjectDashboardKanbanDraggableCard,
  ProjectDashboardKanbanDroppableLane,
} from "~/t3team/t3team-ProjectDashboardKanbanDndUi";
import { TicketWorkItemCard } from "~/t3team/t3team-ProjectDashboardItemViews";
import type { KanbanZoomVisual } from "~/t3team/t3team-kanbanZoom";
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
  zoomVisual,
  parentChildGroups,
  jiraLastCheckedAt,
  projectId,
  onOpenTicket,
  onTicketContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
  optimisticMoves,
  collapsed,
  onToggleCollapsed,
}: {
  column: ProjectTicketKanbanColumn;
  dragging: boolean;
  isHierarchyMode: boolean;
  zoomVisual: KanbanZoomVisual;
  parentChildGroups: TicketHierarchy;
  jiraLastCheckedAt?: number;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  optimisticMoves: Readonly<Record<string, ProjectDashboardKanbanOptimisticMove>>;
  collapsed?: boolean;
  onToggleCollapsed?: (collapsed: boolean) => void;
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
      zoomVisual={zoomVisual}
      {...(collapsed !== undefined ? { collapsed } : {})}
      {...(onToggleCollapsed ? { onToggleCollapsed } : {})}
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
              className="rounded-md bg-background/90"
              style={{
                paddingLeft: `${zoomVisual.cardPaddingRem * 0.6 + 0.4}rem`,
                paddingRight: `${zoomVisual.cardPaddingRem * 0.6 + 0.4}rem`,
                paddingTop: `${zoomVisual.cardPaddingRem}rem`,
                paddingBottom: `${zoomVisual.cardPaddingRem}rem`,
              }}
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
                  zoomVisual={zoomVisual}
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
