import { TicketWorkItemCard, TicketWorkItemRow } from "~/t3work/t3work-ProjectDashboardItemViews";
import { ProjectDashboardHierarchyContent } from "~/t3work/t3work-ProjectDashboardHierarchyContent";
import { ProjectDashboardChildrenCards } from "~/t3work/t3work-ProjectDashboardChildrenCards";
import { GitHubActivityInlineList } from "~/t3work/t3work-GitHubActivityViews";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useTicketAddToChatContextMenus } from "~/t3work/hooks/t3work-useTicketAddToChatContextMenus";

type TicketHierarchy = {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
};

export function ProjectDashboardContent({
  project,
  filteredWorkItems,
  viewMode,
  isHierarchyMode,
  showJiraItems,
  showGitHubActivity,
  kanbanColumns,
  parentChildGroups,
  githubActivityByWorkItem,
  projectId,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  filteredWorkItems: readonly ProjectTicket[];
  viewMode: "grid" | "list" | "kanban";
  isHierarchyMode: boolean;
  showJiraItems: boolean;
  showGitHubActivity: boolean;
  kanbanColumns: {
    todo: { title: string; items: ProjectTicket[] };
    inProgress: { title: string; items: ProjectTicket[] };
    review: { title: string; items: ProjectTicket[] };
    done: { title: string; items: ProjectTicket[] };
    other: { title: string; items: ProjectTicket[] };
  };
  parentChildGroups: TicketHierarchy;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { openTicketContextMenu, openGitHubActivityContextMenu } = useTicketAddToChatContextMenus({
    project,
    projectId,
    projectTickets: filteredWorkItems,
    githubActivityByWorkItem,
  });

  if (filteredWorkItems.length === 0 || !showJiraItems) {
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        {showJiraItems
          ? "No tickets match your current search and filters."
          : "Jira items are hidden by the current item-type setting."}
      </T3SurfacePanel>
    );
  }

  if (viewMode === "kanban") {
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
                      {...(isHierarchyMode ? { childCount: children.length } : {})}
                      onContextMenu={(event) => openTicketContextMenu(event, ticket)}
                      extraChildren={
                        showGitHubActivity ? (
                          <GitHubActivityInlineList
                            items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                            limit={1}
                            compact
                            onItemContextMenu={(event, item) =>
                              openGitHubActivityContextMenu(event, ticket, item)
                            }
                          />
                        ) : null
                      }
                      onOpen={() => onOpenTicket(projectId, ticket.id)}
                    />
                    {isHierarchyMode ? (
                      <ProjectDashboardChildrenCards
                        children={children}
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

  if (isHierarchyMode) {
    return (
      <ProjectDashboardHierarchyContent
        viewMode={viewMode === "list" ? "list" : "grid"}
        parentChildGroups={parentChildGroups}
        showGitHubActivity={showGitHubActivity}
        githubActivityByWorkItem={githubActivityByWorkItem}
        projectId={projectId}
        onTicketContextMenu={openTicketContextMenu}
        onGitHubActivityContextMenu={openGitHubActivityContextMenu}
        onOpenTicket={onOpenTicket}
      />
    );
  }

  if (viewMode === "list") {
    return (
      <T3SurfacePanel tone="muted" className="divide-y divide-border/70">
        {filteredWorkItems.map((ticket) => (
          <div key={ticket.id} className="px-3 py-2.5 transition-colors hover:bg-accent/30">
            <TicketWorkItemRow
              ticket={ticket}
              onContextMenu={(event) => openTicketContextMenu(event, ticket)}
              extraChildren={
                showGitHubActivity ? (
                  <GitHubActivityInlineList
                    items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                    limit={2}
                    onItemContextMenu={(event, item) =>
                      openGitHubActivityContextMenu(event, ticket, item)
                    }
                  />
                ) : null
              }
              onOpen={() => onOpenTicket(projectId, ticket.id)}
            />
          </div>
        ))}
      </T3SurfacePanel>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filteredWorkItems.map((ticket) => (
        <T3SurfacePanel key={ticket.id} tone="muted" className="px-2.5 py-2">
          <TicketWorkItemCard
            ticket={ticket}
            flat
            onContextMenu={(event) => openTicketContextMenu(event, ticket)}
            extraChildren={
              showGitHubActivity ? (
                <GitHubActivityInlineList
                  items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                  limit={3}
                  onItemContextMenu={(event, item) =>
                    openGitHubActivityContextMenu(event, ticket, item)
                  }
                />
              ) : null
            }
            onOpen={() => onOpenTicket(projectId, ticket.id)}
          />
        </T3SurfacePanel>
      ))}
    </div>
  );
}
