import { ProjectDashboardHierarchyContent } from "~/t3team/t3team-ProjectDashboardHierarchyContent";
import { ProjectDashboardKanban } from "~/t3team/t3team-ProjectDashboardKanban";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type { ProjectShellProject } from "@t3tools/project-context";
import {
  DraggableTicketWorkItemCard,
  DraggableTicketWorkItemRow,
} from "~/t3team/t3team-DraggableTicketWorkItems";
import { useTicketAgentContext } from "~/t3team/hooks/t3team-useTicketAgentContext";
import { ProjectDashboardTicketGitHubActivity } from "~/t3team/t3team-ProjectDashboardTicketGitHubActivity";

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
  kanbanColumns: ProjectTicketKanbanColumns;
  parentChildGroups: TicketHierarchy;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  jiraLastCheckedAt?: number;
  githubLastCheckedAt?: number;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const {
    getTicketAgentContext,
    getGitHubActivityAgentContext,
    openTicketAgentContextMenu,
    openGitHubActivityAgentContextMenu,
  } = useTicketAgentContext({
    project,
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
        onTicketContextMenu={openTicketAgentContextMenu}
        onGitHubActivityContextMenu={openGitHubActivityAgentContextMenu}
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
        onTicketContextMenu={openTicketAgentContextMenu}
        onGitHubActivityContextMenu={openGitHubActivityAgentContextMenu}
        getTicketAgentContext={getTicketAgentContext}
        getGitHubActivityDragCapabilities={(ticket, item) =>
          getGitHubActivityAgentContext(ticket, item)
        }
        onOpenTicket={onOpenTicket}
      />
    );
  }

  if (viewMode === "list") {
    return (
      <T3SurfacePanel tone="muted" className="divide-y divide-border/70">
        {filteredWorkItems.map((ticket) => (
          <div key={ticket.id} className="px-3 py-2.5 transition-colors hover:bg-accent/30">
            <DraggableTicketWorkItemRow
              capabilities={getTicketAgentContext(ticket)}
              dragLabel={`${ticket.ref.displayId} ${ticket.ref.title}`}
              ticket={ticket}
              {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
              onContextMenu={(event) => openTicketAgentContextMenu(event, ticket)}
              extraChildren={
                <ProjectDashboardTicketGitHubActivity
                  items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                  enabled={showGitHubActivity}
                  limit={2}
                  {...(githubLastCheckedAt !== undefined
                    ? { lastCheckedAt: githubLastCheckedAt }
                    : {})}
                  onItemContextMenu={(event, item) =>
                    openGitHubActivityAgentContextMenu(event, ticket, item)
                  }
                  getItemDragCapabilities={(item) => getGitHubActivityAgentContext(ticket, item)}
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
          <DraggableTicketWorkItemCard
            capabilities={getTicketAgentContext(ticket)}
            dragLabel={`${ticket.ref.displayId} ${ticket.ref.title}`}
            ticket={ticket}
            flat
            {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
            onContextMenu={(event) => openTicketAgentContextMenu(event, ticket)}
            extraChildren={
              <ProjectDashboardTicketGitHubActivity
                items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                enabled={showGitHubActivity}
                limit={3}
                {...(githubLastCheckedAt !== undefined
                  ? { lastCheckedAt: githubLastCheckedAt }
                  : {})}
                onItemContextMenu={(event, item) =>
                  openGitHubActivityAgentContextMenu(event, ticket, item)
                }
                getItemDragCapabilities={(item) => getGitHubActivityAgentContext(ticket, item)}
              />
            }
            onOpen={() => onOpenTicket(projectId, ticket.id)}
          />
        </T3SurfacePanel>
      ))}
    </div>
  );
}
