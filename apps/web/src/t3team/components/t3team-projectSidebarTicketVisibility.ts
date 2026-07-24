import type { ProjectTicket } from "~/t3team/t3team-types";
import { buildTicketSidebarPinnedItemId } from "~/t3team/t3team-sidebarPinningTypes";
import {
  filterHiddenSidebarItemsById,
  sortSidebarItemsByStoredOrderById,
} from "~/t3team/t3team-sidebarNavPreferences";

import type { TicketViewMode } from "./t3team-projectSidebarShared";

export type TicketHierarchyLike = {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  parentByChildId: ReadonlyMap<string, string>;
};

function countVisibleTicketTreeNodes(
  ticket: ProjectTicket,
  projectId: string,
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>,
  hiddenItemIds: ReadonlySet<string>,
): number {
  const children = (childrenByParentId.get(ticket.id) ?? []).filter(
    (child) =>
      !hiddenItemIds.has(buildTicketSidebarPinnedItemId({ projectId, ticketId: child.id })),
  );
  return (
    1 +
    children.reduce(
      (count, child) =>
        count + countVisibleTicketTreeNodes(child, projectId, childrenByParentId, hiddenItemIds),
      0,
    )
  );
}

export function getTicketSidebarItemId(projectId: string, ticket: ProjectTicket): string {
  return buildTicketSidebarPinnedItemId({ projectId, ticketId: ticket.id });
}

export function collectVisibleTicketTreeIds(input: {
  projectId: string;
  roots: ReadonlyArray<ProjectTicket>;
  unresolvedChildren: ReadonlyArray<ProjectTicket>;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  hiddenItemIds: ReadonlyArray<string>;
}): ReadonlySet<string> {
  const visibleTicketIds = new Set<string>();
  const hiddenItemIdSet = new Set(input.hiddenItemIds);

  const visit = (ticket: ProjectTicket) => {
    const ticketSidebarItemId = getTicketSidebarItemId(input.projectId, ticket);
    if (hiddenItemIdSet.has(ticketSidebarItemId) || visibleTicketIds.has(ticket.id)) {
      return;
    }

    visibleTicketIds.add(ticket.id);
    for (const child of input.childrenByParentId.get(ticket.id) ?? []) {
      visit(child);
    }
  };

  for (const ticket of input.roots) {
    visit(ticket);
  }
  for (const ticket of input.unresolvedChildren) {
    visit(ticket);
  }

  return visibleTicketIds;
}

export function filterAndSortTicketsForSidebar(input: {
  projectId: string;
  tickets: ReadonlyArray<ProjectTicket>;
  hiddenItemIds: ReadonlyArray<string>;
  orderedItemIds: ReadonlyArray<string>;
}): ProjectTicket[] {
  const { projectId, tickets, hiddenItemIds, orderedItemIds } = input;
  return sortSidebarItemsByStoredOrderById(
    filterHiddenSidebarItemsById(tickets, hiddenItemIds, (ticket) =>
      getTicketSidebarItemId(projectId, ticket),
    ),
    orderedItemIds,
    (ticket) => getTicketSidebarItemId(projectId, ticket),
  );
}

export function computeHiddenTicketCount(input: {
  projectId: string;
  ticketViewMode: TicketViewMode;
  projectTicketsLength: number;
  visibleFlatTicketsLength: number;
  visibleTreeRoots: ReadonlyArray<ProjectTicket>;
  visibleTreeUnresolvedChildrenLength: number;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  hiddenItemIds: ReadonlyArray<string>;
}): number {
  if (input.ticketViewMode === "flat") {
    return Math.max(0, input.projectTicketsLength - input.visibleFlatTicketsLength);
  }
  const hiddenItemIdSet = new Set(input.hiddenItemIds);
  const visibleTreeCount =
    input.visibleTreeRoots.reduce(
      (count, ticket) =>
        count +
        countVisibleTicketTreeNodes(
          ticket,
          input.projectId,
          input.childrenByParentId,
          hiddenItemIdSet,
        ),
      0,
    ) + input.visibleTreeUnresolvedChildrenLength;
  return Math.max(0, input.projectTicketsLength - visibleTreeCount);
}

export function deriveTicketVisibility(input: {
  projectId: string;
  projectTickets: readonly ProjectTicket[];
  ticketHierarchy: TicketHierarchyLike;
  ticketViewMode: TicketViewMode;
  hiddenItemIds: ReadonlyArray<string>;
  orderedItemIds: ReadonlyArray<string>;
}) {
  const visibleFlatTickets = filterAndSortTicketsForSidebar({
    projectId: input.projectId,
    tickets: input.projectTickets,
    hiddenItemIds: input.hiddenItemIds,
    orderedItemIds: input.orderedItemIds,
  }).slice(0, 5);
  const visibleTreeRoots = filterAndSortTicketsForSidebar({
    projectId: input.projectId,
    tickets: input.ticketHierarchy.roots,
    hiddenItemIds: input.hiddenItemIds,
    orderedItemIds: input.orderedItemIds,
  }).slice(0, 5);
  const availableSlots = Math.max(0, 5 - visibleTreeRoots.length);
  const visibleTreeUnresolvedChildren =
    availableSlots === 0
      ? ([] as readonly ProjectTicket[])
      : filterAndSortTicketsForSidebar({
          projectId: input.projectId,
          tickets: input.ticketHierarchy.unresolvedChildren,
          hiddenItemIds: input.hiddenItemIds,
          orderedItemIds: input.orderedItemIds,
        }).slice(0, availableSlots);

  const hiddenTicketCount = computeHiddenTicketCount({
    projectId: input.projectId,
    ticketViewMode: input.ticketViewMode,
    projectTicketsLength: input.projectTickets.length,
    visibleFlatTicketsLength: visibleFlatTickets.length,
    visibleTreeRoots,
    visibleTreeUnresolvedChildrenLength: visibleTreeUnresolvedChildren.length,
    childrenByParentId: input.ticketHierarchy.childrenByParentId,
    hiddenItemIds: input.hiddenItemIds,
  });

  return {
    visibleFlatTickets,
    visibleTreeRoots,
    visibleTreeUnresolvedChildren,
    hiddenTicketCount,
  };
}
