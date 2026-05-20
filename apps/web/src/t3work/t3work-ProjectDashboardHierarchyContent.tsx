import { TicketWorkItemCard, TicketWorkItemRow } from "~/t3work/t3work-ProjectDashboardItemViews";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { ProjectDashboardTicketGitHubActivity } from "~/t3work/t3work-ProjectDashboardTicketGitHubActivity";

type TicketHierarchy = {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
};

export function ProjectDashboardHierarchyContent({
  viewMode,
  parentChildGroups,
  showGitHubActivity,
  githubActivityByWorkItem,
  jiraLastCheckedAt,
  githubLastCheckedAt,
  projectId,
  onTicketContextMenu,
  onGitHubActivityContextMenu,
  onOpenTicket,
}: {
  viewMode: "grid" | "list";
  parentChildGroups: TicketHierarchy;
  showGitHubActivity: boolean;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  jiraLastCheckedAt?: number;
  githubLastCheckedAt?: number;
  projectId: string;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  onGitHubActivityContextMenu: (
    event: React.MouseEvent,
    ticket: ProjectTicket,
    item: GitHubWorkActivityItem,
  ) => void;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const renderGitHubActivity = (ticket: ProjectTicket, limit: number, compact?: boolean) => (
    <ProjectDashboardTicketGitHubActivity
      items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
      enabled={showGitHubActivity}
      limit={limit}
      {...(compact ? { compact } : {})}
      {...(githubLastCheckedAt !== undefined ? { lastCheckedAt: githubLastCheckedAt } : {})}
      onItemContextMenu={(event, item) => onGitHubActivityContextMenu(event, ticket, item)}
    />
  );

  if (viewMode === "list") {
    return (
      <div className="space-y-3">
        {parentChildGroups.roots.map((parent) => {
          const children = parentChildGroups.childrenByParentId.get(parent.id) ?? [];
          return (
            <T3SurfacePanel key={parent.id} tone="muted" className="px-3 py-2.5">
              <TicketWorkItemRow
                ticket={parent}
                childCount={children.length}
                {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
                onContextMenu={(event) => onTicketContextMenu(event, parent)}
                extraChildren={renderGitHubActivity(parent, 3)}
                onOpen={() => onOpenTicket(projectId, parent.id)}
              />
              {children.length > 0 ? (
                <T3SurfacePanel tone="inset" className="mt-2 ml-3 rounded-md px-2 py-1.5">
                  <div className="space-y-1.5 border-l-2 border-border/70 pl-2">
                    {children.map((child) => (
                      <TicketWorkItemRow
                        key={child.id}
                        ticket={child}
                        child
                        {...(jiraLastCheckedAt !== undefined
                          ? { lastCheckedAt: jiraLastCheckedAt }
                          : {})}
                        onContextMenu={(event) => onTicketContextMenu(event, child)}
                        extraChildren={renderGitHubActivity(child, 2, true)}
                        onOpen={() => onOpenTicket(projectId, child.id)}
                      />
                    ))}
                  </div>
                </T3SurfacePanel>
              ) : null}
            </T3SurfacePanel>
          );
        })}

        {parentChildGroups.unresolvedChildren.length > 0 ? (
          <T3SurfacePanel tone="dashed" className="px-3 py-2.5">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Unlinked subtasks</div>
            <div className="space-y-1.5">
              {parentChildGroups.unresolvedChildren.map((child) => (
                <TicketWorkItemRow
                  key={child.id}
                  ticket={child}
                  child
                  {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
                  onContextMenu={(event) => onTicketContextMenu(event, child)}
                  extraChildren={renderGitHubActivity(child, 2, true)}
                  onOpen={() => onOpenTicket(projectId, child.id)}
                />
              ))}
            </div>
          </T3SurfacePanel>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[...parentChildGroups.roots, ...parentChildGroups.unresolvedChildren].map((ticket) => {
        const children = parentChildGroups.childrenByParentId.get(ticket.id) ?? [];
        return (
          <T3SurfacePanel key={ticket.id} tone="muted" className="px-2.5 py-2">
            <TicketWorkItemCard
              ticket={ticket}
              flat
              childCount={children.length}
              {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
              onContextMenu={(event) => onTicketContextMenu(event, ticket)}
              extraChildren={renderGitHubActivity(ticket, 3)}
              onOpen={() => onOpenTicket(projectId, ticket.id)}
            />
            {children.length > 0 ? (
              <T3SurfacePanel tone="inset" className="mt-2 ml-2 rounded-md px-2 py-1.5">
                <div className="space-y-1.5 border-l-2 border-border/70 pl-2">
                  {children.map((child) => (
                    <TicketWorkItemCard
                      key={child.id}
                      ticket={child}
                      compact
                      flat
                      child
                      {...(jiraLastCheckedAt !== undefined
                        ? { lastCheckedAt: jiraLastCheckedAt }
                        : {})}
                      onContextMenu={(event) => onTicketContextMenu(event, child)}
                      extraChildren={renderGitHubActivity(child, 2, true)}
                      onOpen={() => onOpenTicket(projectId, child.id)}
                    />
                  ))}
                </div>
              </T3SurfacePanel>
            ) : null}
          </T3SurfacePanel>
        );
      })}
    </div>
  );
}
