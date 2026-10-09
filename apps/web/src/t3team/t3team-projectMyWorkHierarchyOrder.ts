import type {
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import { compareProjectMyWorkTickets } from "~/t3team/t3team-projectMyWorkFiltering";
import type { ProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

export interface ProjectMyWorkHierarchyOrder {
  readonly sortBy: ProjectMyWorkTableSortBy;
  readonly sortDirection: ProjectMyWorkTableSortDirection;
}

/** The list lens' default: whatever was touched most recently comes first. */
export const DEFAULT_PROJECT_MY_WORK_HIERARCHY_ORDER: ProjectMyWorkHierarchyOrder = {
  sortBy: "updated",
  sortDirection: "desc",
};

function readUpdatedAtMs(ticket: ProjectTicket): number {
  const parsed = Date.parse(ticket.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The newest `updatedAt` in each ticket's subtree (itself included). A story whose subtask moved
 * yesterday has been touched yesterday, however old the story's own timestamp is, so it must rank
 * by its subtree or "most recently touched first" would bury the work that is actually moving.
 */
export function buildSubtreeLastTouchedById(
  hierarchy: ProjectTicketHierarchy,
): ReadonlyMap<string, number> {
  const lastTouchedById = new Map<string, number>();
  const visit = (ticket: ProjectTicket, ancestors: ReadonlySet<string>): number => {
    const cached = lastTouchedById.get(ticket.id);
    if (cached !== undefined) return cached;
    let latest = readUpdatedAtMs(ticket);
    const nextAncestors = new Set(ancestors).add(ticket.id);
    for (const child of hierarchy.childrenByParentId.get(ticket.id) ?? []) {
      if (!nextAncestors.has(child.id)) latest = Math.max(latest, visit(child, nextAncestors));
    }
    lastTouchedById.set(ticket.id, latest);
    return latest;
  };
  for (const ticket of [...hierarchy.roots, ...hierarchy.unresolvedChildren]) {
    visit(ticket, new Set());
  }
  return lastTouchedById;
}

/**
 * Children of `parentId`, or the top level when it is `null`. Subtasks whose parent is not loaded
 * (`unresolvedChildren`) stay visible at the top level instead of vanishing from the tree.
 */
export function getOrderedHierarchySiblings(input: {
  hierarchy: ProjectTicketHierarchy;
  parentId: string | null;
  order: ProjectMyWorkHierarchyOrder;
  lastTouchedById: ReadonlyMap<string, number>;
}): ProjectTicket[] {
  const { hierarchy, parentId, order, lastTouchedById } = input;
  const siblings = parentId
    ? (hierarchy.childrenByParentId.get(parentId) ?? [])
    : [...hierarchy.roots, ...hierarchy.unresolvedChildren];
  return siblings.toSorted((left, right) => {
    if (order.sortBy === "updated") {
      const delta =
        (lastTouchedById.get(left.id) ?? readUpdatedAtMs(left)) -
        (lastTouchedById.get(right.id) ?? readUpdatedAtMs(right));
      if (delta !== 0) return order.sortDirection === "asc" ? delta : -delta;
    }
    return compareProjectMyWorkTickets(left, right, order.sortBy, order.sortDirection);
  });
}
