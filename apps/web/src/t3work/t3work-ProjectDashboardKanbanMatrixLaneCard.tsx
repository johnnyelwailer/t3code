import { useLayoutEffect, useRef } from "react";

import { ProjectDashboardKanbanDraggableCard } from "~/t3work/t3work-ProjectDashboardKanbanDndUi";
import { TicketWorkItemCard } from "~/t3work/t3work-ProjectDashboardItemViews";
import { ProjectDashboardTicketGitHubActivity } from "~/t3work/t3work-ProjectDashboardTicketGitHubActivity";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectDashboardKanbanOptimisticMove } from "~/t3work/t3work-projectDashboardKanbanDnd";
import {
  getProjectDashboardKanbanMatrixRowSpanForHeight,
  type ProjectDashboardKanbanMatrixCardPlacement,
} from "~/t3work/t3work-projectDashboardKanbanMatrix";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function ProjectDashboardKanbanMatrixLaneCard({
  placement,
  groupParent,
  inlineParent,
  inlineChild,
  projectId,
  rowHeightPx,
  rowGapPx,
  onMeasuredRowSpan,
  jiraLastCheckedAt,
  githubLastCheckedAt,
  showGitHubActivity,
  githubActivityByWorkItem,
  onOpenTicket,
  onTicketContextMenu,
  onGitHubActivityContextMenu,
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
  jiraLastCheckedAt?: number;
  githubLastCheckedAt?: number;
  showGitHubActivity: boolean;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
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
  const ticket = placement.ticket;
  const isPending = optimisticMoves[ticket.id]?.pending === true;
  const githubActivityItems = githubActivityByWorkItem.get(ticket.ref.displayId) ?? [];
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

  return (
    <div
      data-ticket-id={ticket.id}
      className={`relative z-20 min-h-0 self-start ${groupParent ? "px-2" : inlineChild ? "-mt-1 pl-1.5 pr-2.5" : "px-2"}`}
      style={{
        gridColumn: `${placement.columnIndex + 1} / span ${placement.columnSpan}`,
        gridRow: `${placement.rowStart} / span ${placement.rowSpan}`,
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
            githubActivityItems={githubActivityItems}
            showGitHubActivityTitleBadge={false}
            {...(groupParent ? { groupParent: true } : {})}
            {...(inlineParent ? { inlineParent: true } : {})}
            {...(inlineChild ? { inlineChild: true } : {})}
            {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
            {...(placement.childCount > 0 ? { childCount: placement.childCount } : {})}
            onContextMenu={(event) => onTicketContextMenu(event, ticket)}
            extraChildren={
              renderTicketExtra ? (
                renderTicketExtra(ticket, true)
              ) : (
                <ProjectDashboardTicketGitHubActivity
                  items={githubActivityItems}
                  enabled={showGitHubActivity}
                  limit={1}
                  compact
                  {...(githubLastCheckedAt !== undefined
                    ? { lastCheckedAt: githubLastCheckedAt }
                    : {})}
                  onItemContextMenu={(event, item) =>
                    onGitHubActivityContextMenu(event, ticket, item)
                  }
                />
              )
            }
            onOpen={() => onOpenTicket(projectId, ticket.id)}
          />
        </ProjectDashboardKanbanDraggableCard>
      </div>
    </div>
  );
}
