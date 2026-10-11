import { useLayoutEffect, useRef } from "react";

import { ProjectDashboardKanbanDraggableCard } from "~/t3team/t3team-ProjectDashboardKanbanDndUi";
import { TicketWorkItemCard } from "~/t3team/t3team-ProjectDashboardItemViews";
import type { KanbanZoomVisual } from "~/t3team/t3team-kanbanZoom";
import type { ProjectDashboardKanbanOptimisticMove } from "~/t3team/t3team-projectDashboardKanbanDnd";
import {
  getProjectDashboardKanbanMatrixRowSpanForHeight,
  type ProjectDashboardKanbanMatrixCardPlacement,
} from "~/t3team/t3team-projectDashboardKanbanMatrix";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectDashboardKanbanMatrixLaneCard({
  placement,
  groupParent,
  inlineParent,
  inlineChild,
  projectId,
  rowHeightPx,
  rowGapPx,
  onMeasuredRowSpan,
  zoomVisual,
  jiraLastCheckedAt,
  onOpenTicket,
  onTicketContextMenu,
  renderTicketExtra,
  onMoveTicketToStatus,
  optimisticMoves,
}: {
  placement: ProjectDashboardKanbanMatrixCardPlacement;
  groupParent?: boolean;
  inlineParent?: boolean;
  inlineChild?: boolean;
  projectId: string;
  rowHeightPx: number;
  rowGapPx: number;
  onMeasuredRowSpan?: (ticketId: string, rowSpan: number) => void;
  zoomVisual: KanbanZoomVisual;
  jiraLastCheckedAt?: number;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  renderTicketExtra?: (ticket: ProjectTicket, compact: boolean) => React.ReactNode;
  onMoveTicketToStatus?: (ticket: ProjectTicket, targetStatus: string) => Promise<string>;
  optimisticMoves: Readonly<Record<string, ProjectDashboardKanbanOptimisticMove>>;
}) {
  const ticket = placement.ticket;
  const isPending = optimisticMoves[ticket.id]?.pending === true;
  const contentRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !onMeasuredRowSpan) return;

    const updateMeasuredRowSpan = () => {
      const rowSpan = getProjectDashboardKanbanMatrixRowSpanForHeight({
        heightPx: content.getBoundingClientRect().height,
        rowHeightPx,
        rowGapPx,
      });
      onMeasuredRowSpan(placement.placementKey, rowSpan);
    };

    updateMeasuredRowSpan();
    const observer = new ResizeObserver(updateMeasuredRowSpan);
    observer.observe(content);
    return () => observer.disconnect();
  }, [onMeasuredRowSpan, placement.placementKey, rowGapPx, rowHeightPx]);

  const inset = zoomVisual.matrixCardInsetPx;
  // Keep cards inside the shell curve: group headers get a touch more top room; children nest in.
  const padStyle = groupParent
    ? { paddingLeft: inset, paddingRight: inset, paddingTop: Math.max(6, inset - 2) }
    : inlineChild
      ? {
          paddingLeft: inset + 4,
          paddingRight: inset,
          paddingTop: 2,
          marginTop: -2,
        }
      : { paddingLeft: inset, paddingRight: inset, paddingTop: 2 };

  return (
    <div
      data-ticket-id={ticket.id}
      className="relative z-20 min-h-0 self-start"
      style={{
        gridColumn: `${placement.columnIndex + 1} / span ${placement.columnSpan}`,
        gridRow: `${placement.rowStart} / span ${placement.rowSpan}`,
        ...padStyle,
      }}
    >
      <div ref={contentRef} className="w-full">
        <ProjectDashboardKanbanDraggableCard
          ticketId={ticket.id}
          disabled={!onMoveTicketToStatus || isPending}
          pending={isPending}
        >
          <TicketWorkItemCard
            ticket={ticket}
            compact
            flat
            zoomVisual={zoomVisual}
            {...(groupParent ? { groupParent: true } : {})}
            {...(inlineParent ? { inlineParent: true } : {})}
            {...(inlineChild ? { inlineChild: true } : {})}
            {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
            {...(placement.childCount > 0 ? { childCount: placement.childCount } : {})}
            onContextMenu={(event) => onTicketContextMenu(event, ticket)}
            extraChildren={renderTicketExtra ? renderTicketExtra(ticket, true) : null}
            onOpen={() => onOpenTicket(projectId, ticket.id)}
          />
        </ProjectDashboardKanbanDraggableCard>
      </div>
    </div>
  );
}
