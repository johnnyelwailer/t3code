import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import { ProjectDashboardChildrenCards } from "~/t3work/t3work-ProjectDashboardChildrenCards";
import {
  ProjectDashboardKanbanDraggableCard,
  ProjectDashboardKanbanDroppableLane,
} from "~/t3work/t3work-ProjectDashboardKanbanDndUi";
import { TicketWorkItemCard } from "~/t3work/t3work-ProjectDashboardItemViews";
import { ProjectDashboardTicketGitHubActivity } from "~/t3work/t3work-ProjectDashboardTicketGitHubActivity";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectDashboardKanbanOptimisticMove } from "~/t3work/t3work-projectDashboardKanbanDnd";
import {
  buildProjectDashboardKanbanLaneHierarchy,
  type TicketHierarchy,
} from "~/t3work/t3work-projectDashboardKanbanHierarchy";
import type { ProjectTicketKanbanColumn } from "~/t3work/t3work-projectTicketStatus";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function ProjectDashboardKanbanLane({
  column,
  dragging,
  isHierarchyMode,
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
  column: ProjectTicketKanbanColumn;
  dragging: boolean;
  isHierarchyMode: boolean;
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
          const githubActivityItems = githubActivityByWorkItem.get(ticket.ref.displayId) ?? [];

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
                  githubActivityItems={githubActivityItems}
                  showGitHubActivityTitleBadge={false}
                  {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
                  {...(isHierarchyMode ? { childCount: children.length } : {})}
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
