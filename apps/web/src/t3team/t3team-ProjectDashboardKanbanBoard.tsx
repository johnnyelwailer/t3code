import { DndContext } from "@dnd-kit/core";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { projectDashboardKanbanLaneCollisionDetection } from "~/t3team/t3team-ProjectDashboardKanbanDndUi";
import { ProjectDashboardKanbanMatrixBoard } from "~/t3team/t3team-ProjectDashboardKanbanMatrixBoard";
import { ProjectDashboardKanbanLane } from "~/t3team/t3team-ProjectDashboardKanbanLane";
import {
  buildKanbanGridTemplateColumns,
  type ProjectDashboardKanbanColumnCollapse,
} from "~/t3team/t3team-projectDashboardKanbanCollapse";
import type { TicketHierarchy } from "~/t3team/t3team-projectDashboardKanbanHierarchy";
import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { useProjectDashboardKanbanDnd } from "~/t3team/t3team-useProjectDashboardKanbanDnd";

export {
  buildProjectDashboardKanbanMoveError,
  type ProjectDashboardKanbanMoveError,
} from "~/t3team/t3team-projectDashboardKanbanMoveError";

export function ProjectDashboardKanbanBoard({
  kanbanColumns,
  allTickets,
  isHierarchyMode,
  parentChildGroups,
  jiraLastCheckedAt,
  projectId,
  onOpenTicket,
  onTicketContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
  columnCollapse,
}: {
  kanbanColumns: ProjectTicketKanbanColumns;
  allTickets?: readonly ProjectTicket[];
  isHierarchyMode: boolean;
  parentChildGroups: TicketHierarchy;
  jiraLastCheckedAt?: number;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  columnCollapse?: ProjectDashboardKanbanColumnCollapse;
}) {
  const {
    sensors,
    activeTicketId,
    moveError,
    optimisticMoves,
    displayColumns,
    clearDrag,
    handleDragStart,
    handleDragEnd,
  } = useProjectDashboardKanbanDnd({
    kanbanColumns,
    onMoveTicketToStatus,
  });

  return (
    <>
      {moveError ? <T3TeamErrorState error={moveError} className="mb-3" /> : null}
      <DndContext
        collisionDetection={projectDashboardKanbanLaneCollisionDetection}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={clearDrag}
      >
        {isHierarchyMode ? (
          <ProjectDashboardKanbanMatrixBoard
            kanbanColumns={displayColumns}
            {...(allTickets ? { allTickets } : {})}
            dragging={activeTicketId !== null}
            parentChildGroups={parentChildGroups}
            {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
            projectId={projectId}
            onOpenTicket={onOpenTicket}
            onTicketContextMenu={onTicketContextMenu}
            {...(renderTicketExtra ? { renderTicketExtra } : {})}
            {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
            optimisticMoves={optimisticMoves}
            {...(columnCollapse ? { columnCollapse } : {})}
          />
        ) : (
          <div className="overflow-x-auto pb-2">
            <div
              className="grid min-w-full grid-flow-col gap-3"
              style={{
                gridTemplateColumns: buildKanbanGridTemplateColumns(
                  displayColumns,
                  columnCollapse?.collapsedIds,
                ),
              }}
            >
              {displayColumns.map((column) => (
                <ProjectDashboardKanbanLane
                  key={column.id}
                  column={column}
                  dragging={activeTicketId !== null}
                  isHierarchyMode={isHierarchyMode}
                  parentChildGroups={parentChildGroups}
                  {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
                  projectId={projectId}
                  onOpenTicket={onOpenTicket}
                  onTicketContextMenu={onTicketContextMenu}
                  {...(renderTicketExtra ? { renderTicketExtra } : {})}
                  {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
                  optimisticMoves={optimisticMoves}
                  {...(columnCollapse
                    ? {
                        collapsed: columnCollapse.collapsedIds.has(column.id),
                        onToggleCollapsed: (collapsed: boolean) =>
                          columnCollapse.onToggle(column.id, collapsed),
                      }
                    : {})}
                />
              ))}
            </div>
          </div>
        )}
      </DndContext>
    </>
  );
}
