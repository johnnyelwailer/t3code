import { Fragment, useMemo } from "react";

import { ProjectDashboardKanbanDroppableColumnBody } from "~/t3team/t3team-ProjectDashboardKanbanDndUi";
import {
  buildKanbanGridTemplateColumns,
  withoutCollapsedColumnItems,
  type ProjectDashboardKanbanColumnCollapse,
} from "~/t3team/t3team-projectDashboardKanbanCollapse";
import { ProjectDashboardKanbanMatrixLaneCard } from "~/t3team/t3team-ProjectDashboardKanbanMatrixLaneCard";
import type { KanbanZoomVisual } from "~/t3team/t3team-kanbanZoom";
import type { ProjectDashboardKanbanOptimisticMove } from "~/t3team/t3team-projectDashboardKanbanDnd";
import type { TicketHierarchy } from "~/t3team/t3team-projectDashboardKanbanHierarchy";
import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS,
  PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP_PX,
  PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_HEIGHT_PX,
  useProjectDashboardKanbanMatrixLayout,
} from "~/t3team/t3team-useProjectDashboardKanbanMatrixLayout";

export function ProjectDashboardKanbanMatrixBoard({
  kanbanColumns,
  allTickets,
  dragging,
  parentChildGroups,
  jiraLastCheckedAt,
  projectId,
  zoomVisual,
  onOpenTicket,
  onTicketContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
  optimisticMoves,
  columnCollapse,
}: {
  kanbanColumns: ProjectTicketKanbanColumns;
  allTickets?: readonly ProjectTicket[];
  dragging: boolean;
  parentChildGroups: TicketHierarchy;
  jiraLastCheckedAt?: number;
  projectId: string;
  zoomVisual: KanbanZoomVisual;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  optimisticMoves: Readonly<Record<string, ProjectDashboardKanbanOptimisticMove>>;
  columnCollapse?: ProjectDashboardKanbanColumnCollapse;
}) {
  const collapsedIds = columnCollapse?.collapsedIds;
  // A collapsed column keeps its strip (with the full count) but places no cards in the matrix.
  const layoutColumns = useMemo(
    () => withoutCollapsedColumnItems(kanbanColumns, collapsedIds),
    [kanbanColumns, collapsedIds],
  );
  const {
    layout,
    shellHeaderPlacementKeys,
    shellRenderPlans,
    shellDepthByPlacementKey,
    inlineRelationshipPlacementKeys,
    handleMeasuredRowSpan,
    boardRowCount,
    boardBodyStyle,
  } = useProjectDashboardKanbanMatrixLayout({
    kanbanColumns: layoutColumns,
    allTickets,
    parentChildGroups,
    laneMinWidthRem: zoomVisual.laneMinWidthRem,
    columnGapRem: zoomVisual.columnGapRem,
  });

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="grid min-w-full gap-y-1"
        style={{
          ...boardBodyStyle,
          gridTemplateColumns: buildKanbanGridTemplateColumns(
            kanbanColumns,
            collapsedIds,
            zoomVisual.laneMinWidthRem,
          ),
        }}
      >
        {kanbanColumns.map((column, columnIndex) => (
          <ProjectDashboardKanbanDroppableColumnBody
            key={column.id}
            columnId={column.id}
            title={column.title}
            count={column.items.length}
            dragging={dragging}
            laneMinWidthRem={zoomVisual.laneMinWidthRem}
            headerBorderOpacity={zoomVisual.laneHeaderBorderOpacity}
            {...(columnCollapse
              ? {
                  collapsed: columnCollapse.collapsedIds.has(column.id),
                  onToggleCollapsed: (collapsed: boolean) =>
                    columnCollapse.onToggle(column.id, collapsed),
                }
              : {})}
            style={{
              gridColumn: columnIndex + 1,
              gridRow: `1 / span ${boardRowCount + PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS}`,
            }}
          />
        ))}

        {shellRenderPlans.map((plan) => {
          const shellDepth = shellDepthByPlacementKey.get(plan.placementKey) ?? 0;
          // Nesting adds inset; base inset is sized to clear the shell radius so cards never
          // poke through the rounded corner (the old 4px inset + 1.35rem radius clipped badly).
          const shellInsetStartPx = zoomVisual.shellInsetStartPx + shellDepth * 5;
          const shellInsetEndPx = zoomVisual.shellInsetEndPx + shellDepth * 7;
          // Outer epic quieter; nested story shells slightly stronger so hierarchy reads.
          const shellBg =
            shellDepth === 0
              ? "color-mix(in oklab, var(--background) 88%, var(--muted) 12%)"
              : "color-mix(in oklab, var(--background) 96%, var(--muted) 4%)";
          const shellBorder =
            shellDepth === 0
              ? "color-mix(in oklab, var(--border) 70%, transparent)"
              : "color-mix(in oklab, var(--border) 55%, transparent)";
          const shellStyle = {
            borderRadius: `${zoomVisual.shellRadiusRem}rem`,
            borderWidth: zoomVisual.shellBorderWidthPx,
            borderStyle: "solid" as const,
            borderColor: shellBorder,
            backgroundColor: shellBg,
            marginInlineStart: `${shellInsetStartPx}px`,
            marginInlineEnd: `${shellInsetEndPx}px`,
            ...(shellDepth > 0 ? { marginBottom: "6px" } : { marginBottom: "2px" }),
          };

          if (plan.kind === "singleLane") {
            return (
              <Fragment key={`shell:${plan.placementKey}`}>
                <div
                  data-shell-ticket={plan.ticketId}
                  data-shell-role="single-lane"
                  data-shell-depth={shellDepth}
                  className="pointer-events-none relative z-10 inset-shadow-2xs inset-shadow-white/4"
                  style={{
                    gridColumn: plan.columnIndex + 1,
                    gridRow: `${PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS + plan.rowStart} / span ${plan.rowSpan}`,
                    ...shellStyle,
                  }}
                />
              </Fragment>
            );
          }

          return (
            <Fragment key={`shell:${plan.placementKey}`}>
              <div
                data-shell-ticket={plan.ticketId}
                data-shell-role="spanning"
                data-shell-depth={shellDepth}
                className="pointer-events-none relative z-10 inset-shadow-2xs inset-shadow-white/4"
                style={{
                  gridColumn: `${plan.columnIndex + 1} / span ${plan.columnSpan}`,
                  gridRow: `${PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS + plan.rowStart} / span ${plan.rowSpan}`,
                  ...shellStyle,
                }}
              />
            </Fragment>
          );
        })}

        {layout.cards.map((placement) => (
          <ProjectDashboardKanbanMatrixLaneCard
            key={placement.placementKey}
            placement={{
              ...placement,
              rowStart: PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS + placement.rowStart,
            }}
            groupParent={shellHeaderPlacementKeys.has(placement.placementKey)}
            inlineParent={inlineRelationshipPlacementKeys.parentPlacementKeys.has(
              placement.placementKey,
            )}
            inlineChild={inlineRelationshipPlacementKeys.childPlacementKeys.has(
              placement.placementKey,
            )}
            projectId={projectId}
            rowHeightPx={PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_HEIGHT_PX}
            rowGapPx={PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP_PX}
            onMeasuredRowSpan={handleMeasuredRowSpan}
            zoomVisual={zoomVisual}
            {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
            onOpenTicket={onOpenTicket}
            onTicketContextMenu={onTicketContextMenu}
            {...(renderTicketExtra ? { renderTicketExtra } : {})}
            {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
            optimisticMoves={optimisticMoves}
          />
        ))}
      </div>
    </div>
  );
}
