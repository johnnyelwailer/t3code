import type { ProjectTicket } from "~/t3team/t3team-types";

import type { ProjectRowProps } from "./t3team-projectSidebarProjectRowTypes";

function collectVisibleTicketIds(
  ticket: ProjectTicket,
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>,
  visibleTicketIds: Set<string>,
): void {
  if (visibleTicketIds.has(ticket.id)) {
    return;
  }

  visibleTicketIds.add(ticket.id);
  for (const child of childrenByParentId.get(ticket.id) ?? []) {
    collectVisibleTicketIds(child, childrenByParentId, visibleTicketIds);
  }
}

export function buildVisibleTicketIdSet(input: {
  showJiraItems: boolean;
  ticketViewMode: ProjectRowProps["ticketViewMode"];
  visibleFlatTickets: ReadonlyArray<ProjectTicket>;
  visibleTreeRoots: ReadonlyArray<ProjectTicket>;
  visibleTreeUnresolvedChildren: ReadonlyArray<ProjectTicket>;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
}): ReadonlySet<string> {
  const visibleTicketIds = new Set<string>();

  if (!input.showJiraItems) {
    return visibleTicketIds;
  }

  if (input.ticketViewMode === "flat") {
    for (const ticket of input.visibleFlatTickets) {
      visibleTicketIds.add(ticket.id);
    }
    return visibleTicketIds;
  }

  for (const ticket of input.visibleTreeRoots) {
    collectVisibleTicketIds(ticket, input.childrenByParentId, visibleTicketIds);
  }
  for (const ticket of input.visibleTreeUnresolvedChildren) {
    collectVisibleTicketIds(ticket, input.childrenByParentId, visibleTicketIds);
  }

  return visibleTicketIds;
}
