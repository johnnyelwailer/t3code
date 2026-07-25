import type { ProjectTicket } from "~/t3team/t3team-types";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import {
  buildProjectTicketHierarchy,
  type ProjectTicketHierarchy,
} from "~/t3team/t3team-ticketHierarchy";

import type { TicketViewMode } from "./t3team-projectSidebarShared";
import {
  collectVisibleTicketTreeIds,
  computeHiddenTicketCount,
  filterAndSortTicketsForSidebar,
  getTicketSidebarItemId,
  type TicketHierarchyLike,
} from "./t3team-projectSidebarTicketVisibility";
import type { ResolvedPinnedSidebarItem } from "./t3team-useProjectSidebarPinnedItems";

function collectPinnedHierarchyTicketIds(input: {
  matchedTicketIds: ReadonlySet<string>;
  ticketHierarchy: TicketHierarchyLike;
}): ReadonlySet<string> {
  const visibleTicketIds = new Set<string>();

  const addAncestors = (ticketId: string) => {
    let parentId = input.ticketHierarchy.parentByChildId.get(ticketId);
    while (parentId) {
      if (!visibleTicketIds.has(parentId)) {
        visibleTicketIds.add(parentId);
      }
      parentId = input.ticketHierarchy.parentByChildId.get(parentId);
    }
  };

  const addDescendants = (ticketId: string) => {
    for (const child of input.ticketHierarchy.childrenByParentId.get(ticketId) ?? []) {
      if (!visibleTicketIds.has(child.id)) {
        visibleTicketIds.add(child.id);
        addDescendants(child.id);
      }
    }
  };

  for (const ticketId of input.matchedTicketIds) {
    visibleTicketIds.add(ticketId);
    addAncestors(ticketId);
    addDescendants(ticketId);
  }

  return visibleTicketIds;
}

export function buildPinnedOnlyMyActivityFeed(input: {
  projectId: string;
  projectTickets: ReadonlyArray<ProjectTicket>;
  ticketHierarchy: TicketHierarchyLike;
  ticketViewMode: TicketViewMode;
  hiddenItemIds: ReadonlyArray<string>;
  orderedItemIds: ReadonlyArray<string>;
  pinnedItems: ReadonlyArray<ResolvedPinnedSidebarItem>;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  unlinkedGitHubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
}) {
  const pinnedTicketIds = new Set<string>();
  const pinnedGitHubActivityIds = new Set<string>();
  const unresolvedPinnedItems: ResolvedPinnedSidebarItem[] = [];

  for (const pinnedItem of input.pinnedItems) {
    if (pinnedItem.kind === "jira-work-item") {
      pinnedTicketIds.add(pinnedItem.ticket.id);
      continue;
    }

    if (pinnedItem.kind === "jira-work-item-unresolved") {
      unresolvedPinnedItems.push(pinnedItem);
      continue;
    }

    pinnedGitHubActivityIds.add(pinnedItem.item.id);
    if (pinnedItem.linkedWorkItem) {
      pinnedTicketIds.add(pinnedItem.linkedWorkItem.id);
    }
  }

  const pinnedHierarchyTicketIds = collectPinnedHierarchyTicketIds({
    matchedTicketIds: pinnedTicketIds,
    ticketHierarchy: input.ticketHierarchy,
  });
  const hierarchyProjectTickets = input.projectTickets.filter((ticket) =>
    pinnedHierarchyTicketIds.has(ticket.id),
  );
  const visibleHierarchy: ProjectTicketHierarchy =
    buildProjectTicketHierarchy(hierarchyProjectTickets);
  const visibleHierarchySidebarItemIds = new Set(
    hierarchyProjectTickets.map((ticket) => getTicketSidebarItemId(input.projectId, ticket)),
  );
  const hierarchyHiddenItemIds = input.hiddenItemIds.filter((itemId) =>
    visibleHierarchySidebarItemIds.has(itemId),
  );

  const visibleFlatTickets = filterAndSortTicketsForSidebar({
    projectId: input.projectId,
    tickets: hierarchyProjectTickets,
    hiddenItemIds: hierarchyHiddenItemIds,
    orderedItemIds: input.orderedItemIds,
  });
  const visibleTreeRoots = filterAndSortTicketsForSidebar({
    projectId: input.projectId,
    tickets: visibleHierarchy.roots,
    hiddenItemIds: hierarchyHiddenItemIds,
    orderedItemIds: input.orderedItemIds,
  });
  const visibleTreeUnresolvedChildren = filterAndSortTicketsForSidebar({
    projectId: input.projectId,
    tickets: visibleHierarchy.unresolvedChildren,
    hiddenItemIds: hierarchyHiddenItemIds,
    orderedItemIds: input.orderedItemIds,
  });

  const githubActivityByWorkItem = new Map<string, GitHubWorkActivityItem[]>();
  for (const ticket of hierarchyProjectTickets) {
    const filteredItems = (input.githubActivityByWorkItem.get(ticket.ref.displayId) ?? []).filter(
      (item) => pinnedGitHubActivityIds.has(item.id),
    );
    if (filteredItems.length > 0) {
      githubActivityByWorkItem.set(ticket.ref.displayId, filteredItems);
    }
  }

  const unlinkedGitHubActivityItems = input.unlinkedGitHubActivityItems.filter((item) =>
    pinnedGitHubActivityIds.has(item.id),
  );
  const visibleTicketIds =
    input.ticketViewMode === "tree"
      ? collectVisibleTicketTreeIds({
          projectId: input.projectId,
          roots: visibleTreeRoots,
          unresolvedChildren: visibleTreeUnresolvedChildren,
          childrenByParentId: visibleHierarchy.childrenByParentId,
          hiddenItemIds: hierarchyHiddenItemIds,
        })
      : new Set(visibleFlatTickets.map((ticket) => ticket.id));
  const hiddenTicketCount = computeHiddenTicketCount({
    projectId: input.projectId,
    ticketViewMode: input.ticketViewMode,
    projectTicketsLength: hierarchyProjectTickets.length,
    visibleFlatTicketsLength: visibleFlatTickets.length,
    visibleTreeRoots,
    visibleTreeUnresolvedChildrenLength: visibleTreeUnresolvedChildren.length,
    childrenByParentId: visibleHierarchy.childrenByParentId,
    hiddenItemIds: hierarchyHiddenItemIds,
  });

  return {
    visibleFlatTickets,
    projectTickets: input.ticketViewMode === "tree" ? hierarchyProjectTickets : visibleFlatTickets,
    ticketHierarchy: visibleHierarchy,
    githubActivityByWorkItem,
    unlinkedGitHubActivityItems,
    unresolvedPinnedItems,
    visibleTicketIds,
    hiddenTicketCount,
  };
}
