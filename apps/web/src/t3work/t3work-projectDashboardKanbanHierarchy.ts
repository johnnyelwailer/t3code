import { buildVisibleBacklogHierarchy } from "~/t3work/t3work-projectBacklogPresentation";
import type { ProjectTicket } from "~/t3work/t3work-types";

export type TicketHierarchy = {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
};

function collectProjectDashboardKanbanHierarchyTickets(
  hierarchy: TicketHierarchy,
): readonly ProjectTicket[] {
  const collected: ProjectTicket[] = [];
  const seenTicketIds = new Set<string>();

  const visit = (ticket: ProjectTicket) => {
    if (seenTicketIds.has(ticket.id)) return;
    seenTicketIds.add(ticket.id);
    collected.push(ticket);
    for (const child of hierarchy.childrenByParentId.get(ticket.id) ?? []) visit(child);
  };

  for (const root of hierarchy.roots) visit(root);
  for (const child of hierarchy.unresolvedChildren) visit(child);
  return collected;
}

export function buildProjectDashboardKanbanLaneHierarchy(
  hierarchy: TicketHierarchy,
  laneTickets: readonly ProjectTicket[],
): TicketHierarchy {
  if (laneTickets.length === 0) {
    return { roots: [], unresolvedChildren: [], childrenByParentId: new Map() };
  }

  return buildVisibleBacklogHierarchy(
    collectProjectDashboardKanbanHierarchyTickets(hierarchy),
    laneTickets,
    { includeDescendants: true },
  ).visibleHierarchy;
}
