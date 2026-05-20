import { TicketWorkItemCard, TicketWorkItemRow } from "~/t3work/t3work-ProjectDashboardItemViews";
import { ProjectDashboardHierarchyContent } from "~/t3work/t3work-ProjectDashboardHierarchyContent";
import { ProjectDashboardKanban } from "~/t3work/t3work-ProjectDashboardKanban";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useTicketAddToChatContextMenus } from "~/t3work/hooks/t3work-useTicketAddToChatContextMenus";
import { ProjectDashboardTicketGitHubActivity } from "~/t3work/t3work-ProjectDashboardTicketGitHubActivity";

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
  jiraLastCheckedAt,
  githubLastCheckedAt,
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
  jiraLastCheckedAt?: number;
  githubLastCheckedAt?: number;
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
      <ProjectDashboardKanban
        kanbanColumns={kanbanColumns}
        isHierarchyMode={isHierarchyMode}
        parentChildGroups={parentChildGroups}
        {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
        {...(githubLastCheckedAt !== undefined ? { githubLastCheckedAt } : {})}
        showGitHubActivity={showGitHubActivity}
        githubActivityByWorkItem={githubActivityByWorkItem}
        projectId={projectId}
        onOpenTicket={onOpenTicket}
        onTicketContextMenu={openTicketContextMenu}
        onGitHubActivityContextMenu={openGitHubActivityContextMenu}
      />
    );
  }

  if (isHierarchyMode) {
    return (
      <ProjectDashboardHierarchyContent
        viewMode={viewMode === "list" ? "list" : "grid"}
        parentChildGroups={parentChildGroups}
        showGitHubActivity={showGitHubActivity}
        githubActivityByWorkItem={githubActivityByWorkItem}
        {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
        {...(githubLastCheckedAt !== undefined ? { githubLastCheckedAt } : {})}
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
              {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
              onContextMenu={(event) => openTicketContextMenu(event, ticket)}
              extraChildren={
                <ProjectDashboardTicketGitHubActivity
                  items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                  enabled={showGitHubActivity}
                  limit={2}
                  {...(githubLastCheckedAt !== undefined
                    ? { lastCheckedAt: githubLastCheckedAt }
                    : {})}
                  onItemContextMenu={(event, item) =>
                    openGitHubActivityContextMenu(event, ticket, item)
                  }
                />
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
            {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
            onContextMenu={(event) => openTicketContextMenu(event, ticket)}
            extraChildren={
              <ProjectDashboardTicketGitHubActivity
                items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                enabled={showGitHubActivity}
                limit={3}
                {...(githubLastCheckedAt !== undefined
                  ? { lastCheckedAt: githubLastCheckedAt }
                  : {})}
                onItemContextMenu={(event, item) =>
                  openGitHubActivityContextMenu(event, ticket, item)
                }
              />
            }
            onOpen={() => onOpenTicket(projectId, ticket.id)}
          />
        </T3SurfacePanel>
      ))}
    </div>
  );
}
