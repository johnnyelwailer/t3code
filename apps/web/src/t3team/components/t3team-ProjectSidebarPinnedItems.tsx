import { useTicketAgentContext } from "~/t3team/hooks/t3team-useTicketAgentContext";
import { SidebarMenuSub } from "~/t3team/components/ui/t3team-sidebar";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { sortSidebarItemsByStoredOrder } from "~/t3team/t3team-sidebarNavPreferences";
import type { ProjectTicket, ViewState } from "~/t3team/t3team-types";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useMemo } from "react";

import { getSidebarTicketState } from "./t3team-projectSidebarItemState";
import {
  PinnedGitHubActivityRow,
  PinnedTicketFallbackRow,
  PinnedTicketRow,
} from "./t3team-ProjectSidebarPinnedTicketRows";
import { useProjectSidebarNavItemPreferences } from "./t3team-useProjectSidebarNavItemPreferences";
import type { ResolvedPinnedSidebarItem } from "./t3team-useProjectSidebarPinnedItems";

export function ProjectSidebarPinnedItems({
  project,
  projectTickets,
  githubActivityByWorkItem,
  items,
  view,
  visibleTicketIds,
  jiraLastCheckedAt,
  githubActivityLastCheckedAt: _githubActivityLastCheckedAt,
  onSelectTicket,
}: {
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  items: ReadonlyArray<ResolvedPinnedSidebarItem>;
  view: ViewState | null;
  visibleTicketIds: ReadonlySet<string>;
  jiraLastCheckedAt?: number;
  githubActivityLastCheckedAt?: number;
  onSelectTicket: (projectId: string, ticketId: string) => void;
}) {
  const {
    getTicketAgentContext,
    getGitHubActivityAgentContext,
    openTicketAgentContextMenu,
    openTicketAgentContextMenuAt,
    openGitHubActivityAgentContextMenu,
  } = useTicketAgentContext({ project, projectTickets, githubActivityByWorkItem });
  const { orderedItemIds } = useProjectSidebarNavItemPreferences(project.id);
  const sortedItems = useMemo(
    () =>
      sortSidebarItemsByStoredOrder(
        items.map((item) => ({ id: item.pinnedItem.id, item })),
        orderedItemIds,
      ).map((entry) => entry.item),
    [items, orderedItemIds],
  );

  if (sortedItems.length === 0) {
    return null;
  }
  const pinnedTicketSidebarItemIds = sortedItems
    .filter(
      (
        item,
      ): item is Extract<
        ResolvedPinnedSidebarItem,
        { kind: "jira-work-item" | "jira-work-item-unresolved" }
      > => item.kind === "jira-work-item" || item.kind === "jira-work-item-unresolved",
    )
    .map((item) => item.pinnedItem.id);

  return (
    <SidebarMenuSub className="mx-1 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 pb-0.5">
      {sortedItems.map((item) =>
        item.kind === "jira-work-item" ? (
          (() => {
            const ticketState = getSidebarTicketState({
              view,
              ticketId: item.ticket.id,
              ticketThreads: item.ticketThreads,
            });
            const pinnedState = visibleTicketIds.has(item.ticket.id)
              ? { ...ticketState, isSelected: false }
              : ticketState;

            return (
              <PinnedTicketRow
                key={item.pinnedItem.id}
                projectId={project.id}
                sidebarItemId={item.pinnedItem.id}
                sidebarNavOrderScopeIds={pinnedTicketSidebarItemIds}
                ticket={item.ticket}
                state={pinnedState}
                ticketAgentContext={getTicketAgentContext(item.ticket, {
                  visibleInSidebar: true,
                })}
                {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
                onSelectTicket={onSelectTicket}
                onContextMenu={(event) =>
                  openTicketAgentContextMenu(event, item.ticket, { visibleInSidebar: true })
                }
                onOpenMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  openTicketAgentContextMenuAt(
                    item.ticket,
                    Math.round(rect.left + rect.width / 2),
                    Math.round(rect.bottom),
                    { visibleInSidebar: true },
                  );
                }}
              />
            );
          })()
        ) : item.kind === "jira-work-item-unresolved" ? (
          <PinnedTicketFallbackRow
            key={item.pinnedItem.id}
            state={getSidebarTicketState({
              view,
              ticketId: item.ticketId,
              ticketThreads: item.ticketThreads,
            })}
            onSelectTicket={onSelectTicket}
            projectId={project.id}
            ticketDisplayId={item.ticketDisplayId}
            ticketId={item.ticketId}
            title={item.title}
          />
        ) : (
          <PinnedGitHubActivityRow
            key={item.pinnedItem.id}
            item={item.item}
            state={{ isSelected: false, isOpen: false }}
            onContextMenu={(event) => {
              openGitHubActivityAgentContextMenu(event, item.linkedWorkItem, item.item, {
                visibleInSidebar: true,
              });
            }}
            getItemDragCapabilities={(activity) =>
              getGitHubActivityAgentContext(item.linkedWorkItem, activity, {
                visibleInSidebar: true,
              })
            }
          />
        ),
      )}
    </SidebarMenuSub>
  );
}
