import { Fragment } from "react";

import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { ProjectDashboardKanbanDroppableColumnBody } from "~/t3team/t3team-ProjectDashboardKanbanDndUi";
import { ProjectDashboardKanbanMatrixLaneCard } from "~/t3team/t3team-ProjectDashboardKanbanMatrixLaneCard";
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
  githubLastCheckedAt,
  showGitHubActivity,
  githubActivityByWorkItem,
  projectId,
  onOpenTicket,
  onTicketContextMenu,
  onGitHubActivityContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
  optimisticMoves,
}: {
  kanbanColumns: ProjectTicketKanbanColumns;
  allTickets?: readonly ProjectTicket[];
  dragging: boolean;
  parentChildGroups: TicketHierarchy;
  jiraLastCheckedAt?: number;
  githubLastCheckedAt?: number;
  showGitHubActivity: boolean;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  onGitHubActivityContextMenu: (
    event: React.MouseEvent,
    ticket: ProjectTicket,
    item: GitHubWorkActivityItem,
  ) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  optimisticMoves: Readonly<Record<string, ProjectDashboardKanbanOptimisticMove>>;
}) {
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
    kanbanColumns,
    allTickets,
    parentChildGroups,
  });

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-full gap-x-3 gap-y-1" style={boardBodyStyle}>
        {kanbanColumns.map((column, columnIndex) => (
          <ProjectDashboardKanbanDroppableColumnBody
            key={column.id}
            columnId={column.id}
            title={column.title}
            count={column.items.length}
            dragging={dragging}
            style={{
              gridColumn: columnIndex + 1,
              gridRow: `1 / span ${boardRowCount + PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS}`,
            }}
          />
        ))}

        {shellRenderPlans.map((plan) => {
          const shellDepth = shellDepthByPlacementKey.get(plan.placementKey) ?? 0;
          const shellInsetStartPx = 4 + shellDepth * 4;
          const shellInsetEndPx = 4 + shellDepth * 8;

          if (plan.kind === "singleLane") {
            return (
              <Fragment key={`shell:${plan.placementKey}`}>
                <div
                  data-shell-ticket={plan.ticketId}
                  data-shell-role="single-lane"
                  data-shell-depth={shellDepth}
                  className="pointer-events-none relative z-10 rounded-[1.35rem] border-[1.5px] border-border bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  style={{
                    gridColumn: plan.columnIndex + 1,
                    gridRow: `${PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS + plan.rowStart} / span ${plan.rowSpan}`,
                    marginInlineStart: `${shellInsetStartPx}px`,
                    marginInlineEnd: `${shellInsetEndPx}px`,
                    ...(shellDepth > 0 ? { marginBottom: "4px" } : {}),
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
                className="pointer-events-none relative z-10 rounded-[1.35rem] border-[1.5px] border-border bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                style={{
                  gridColumn: `${plan.columnIndex + 1} / span ${plan.columnSpan}`,
                  gridRow: `${PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS + plan.rowStart} / span ${plan.rowSpan}`,
                  marginInlineStart: `${shellInsetStartPx}px`,
                  marginInlineEnd: `${shellInsetEndPx}px`,
                  ...(shellDepth > 0 ? { marginBottom: "4px" } : {}),
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
            {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
            {...(githubLastCheckedAt !== undefined ? { githubLastCheckedAt } : {})}
            showGitHubActivity={showGitHubActivity}
            githubActivityByWorkItem={githubActivityByWorkItem}
            onOpenTicket={onOpenTicket}
            onTicketContextMenu={onTicketContextMenu}
            onGitHubActivityContextMenu={onGitHubActivityContextMenu}
            {...(renderTicketExtra ? { renderTicketExtra } : {})}
            {...(onMoveTicketToStatus ? { onMoveTicketToStatus } : {})}
            optimisticMoves={optimisticMoves}
          />
        ))}
      </div>
    </div>
  );
}
