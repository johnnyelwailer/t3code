import type { ProjectTicket } from "~/t3work/t3work-types";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import { TicketWorkItemCard } from "~/t3work/t3work-ProjectDashboardItemViews";
import { ProjectDashboardChildrenCards } from "~/t3work/t3work-ProjectDashboardChildrenCards";
import { ProjectDashboardTicketGitHubActivity } from "~/t3work/t3work-ProjectDashboardTicketGitHubActivity";

type TicketHierarchy = {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
};

export function ProjectDashboardKanban({
  kanbanColumns,
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
}: {
  kanbanColumns: {
    todo: { title: string; items: ProjectTicket[] };
    inProgress: { title: string; items: ProjectTicket[] };
    review: { title: string; items: ProjectTicket[] };
    done: { title: string; items: ProjectTicket[] };
    other: { title: string; items: ProjectTicket[] };
  };
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
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {(
        [
          ["todo", kanbanColumns.todo],
          ["inProgress", kanbanColumns.inProgress],
          ["review", kanbanColumns.review],
          ["done", kanbanColumns.done],
          ["other", kanbanColumns.other],
        ] as const
      ).map(([key, column]) => (
        <T3SurfacePanel key={key} tone="soft" className="min-w-0 p-2 @container/kanban-lane">
          <div className="mb-2 flex items-center justify-between border-b border-border/70 pb-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {column.title}
            </h4>
            <span className="text-[11px] text-muted-foreground">{column.items.length}</span>
          </div>
          <div className="space-y-1.5">
            {(isHierarchyMode
              ? [
                  ...parentChildGroups.roots.filter((parent) =>
                    column.items.some((item) => item.id === parent.id),
                  ),
                  ...(key === "other" ? parentChildGroups.unresolvedChildren : []),
                ]
              : column.items
            ).map((ticket) => {
              const children = parentChildGroups.childrenByParentId.get(ticket.id) ?? [];
              return (
                <T3SurfacePanel
                  key={ticket.id}
                  tone="default"
                  className="rounded-md bg-background/90 px-2.5 py-2"
                >
                  <TicketWorkItemCard
                    ticket={ticket}
                    compact
                    flat
                    {...(jiraLastCheckedAt !== undefined
                      ? { lastCheckedAt: jiraLastCheckedAt }
                      : {})}
                    {...(isHierarchyMode ? { childCount: children.length } : {})}
                    onContextMenu={(event) => onTicketContextMenu(event, ticket)}
                    extraChildren={
                      <ProjectDashboardTicketGitHubActivity
                        items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
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
                    }
                    onOpen={() => onOpenTicket(projectId, ticket.id)}
                  />
                  {isHierarchyMode ? (
                    <ProjectDashboardChildrenCards
                      tickets={children}
                      {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
                      projectId={projectId}
                      onOpenTicket={onOpenTicket}
                    />
                  ) : null}
                </T3SurfacePanel>
              );
            })}
          </div>
        </T3SurfacePanel>
      ))}
    </div>
  );
}
