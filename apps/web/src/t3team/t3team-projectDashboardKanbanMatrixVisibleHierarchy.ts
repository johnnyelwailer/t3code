import { buildVisibleBacklogHierarchy } from "~/t3team/t3team-projectBacklogPresentation";
import type { TicketHierarchy } from "~/t3team/t3team-projectDashboardKanbanHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

function collectHierarchyTicketIds(hierarchy: TicketHierarchy): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const ticket of hierarchy.roots) ids.add(ticket.id);
  for (const ticket of hierarchy.unresolvedChildren) ids.add(ticket.id);
  for (const children of hierarchy.childrenByParentId.values()) {
    for (const child of children) ids.add(child.id);
  }

  return ids;
}

export function resolveProjectDashboardKanbanMatrixVisibleHierarchy(input: {
  allTickets?: readonly ProjectTicket[];
  matchedTickets: readonly ProjectTicket[];
  parentChildGroups: TicketHierarchy;
}): TicketHierarchy {
  const parentHierarchyTicketIds = collectHierarchyTicketIds(input.parentChildGroups);
  const matchedTicketIds = new Set(input.matchedTickets.map((ticket) => ticket.id));
  const parentHierarchyHasContextTickets = [...parentHierarchyTicketIds].some(
    (ticketId) => !matchedTicketIds.has(ticketId),
  );

  if (parentHierarchyHasContextTickets) {
    return input.parentChildGroups;
  }

  if (input.allTickets && input.allTickets.length > 0) {
    return buildVisibleBacklogHierarchy(input.allTickets, input.matchedTickets).visibleHierarchy;
  }

  return input.parentChildGroups;
}
