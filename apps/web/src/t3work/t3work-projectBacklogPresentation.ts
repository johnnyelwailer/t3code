import { buildProjectTicketHierarchy, type ProjectTicketHierarchy } from "./t3work-ticketHierarchy";
import type { ProjectTicket } from "./t3work-types";
import {
  compareProjectBacklogTickets,
  hasProjectBacklogAssignee,
  hasProjectBacklogEstimate,
} from "./t3work-projectBacklogUtils";
import {
  projectBacklogPlanningLaneOrder,
  projectBacklogPlanningMeta,
  projectBacklogViewModes,
} from "./t3work-projectBacklogPresentationMeta";

export { projectBacklogViewModes } from "./t3work-projectBacklogPresentationMeta";

export type ProjectBacklogViewMode =
  | "hierarchy"
  | "planning"
  | "ownership"
  | "table"
  | "planning-space";
export type ProjectBacklogPlanningState =
  | "needs-owner-and-estimate"
  | "needs-owner"
  | "needs-estimate"
  | "ready";

export interface ProjectBacklogTicketContext {
  ancestors: readonly ProjectTicket[];
  directChildren: readonly ProjectTicket[];
  descendantCount: number;
  planningState: ProjectBacklogPlanningState;
}

export interface ProjectBacklogPlanningLane {
  id: ProjectBacklogPlanningState;
  label: string;
  description: string;
  tickets: readonly ProjectTicket[];
}

export interface ProjectBacklogOwnershipGroup {
  id: string;
  label: string;
  tickets: readonly ProjectTicket[];
  needsPlanCount: number;
  withSubtasksCount: number;
}

export function getProjectBacklogPlanningState(ticket: ProjectTicket): ProjectBacklogPlanningState {
  const hasAssignee = hasProjectBacklogAssignee(ticket);
  const hasEstimate = hasProjectBacklogEstimate(ticket);
  if (!hasAssignee && !hasEstimate) {
    return "needs-owner-and-estimate";
  }
  if (!hasAssignee) {
    return "needs-owner";
  }
  if (!hasEstimate) {
    return "needs-estimate";
  }
  return "ready";
}

export function getProjectBacklogPlanningMeta(state: ProjectBacklogPlanningState) {
  return projectBacklogPlanningMeta[state];
}

export function buildProjectBacklogTicketContext(
  tickets: readonly ProjectTicket[],
  hierarchy: ProjectTicketHierarchy,
): ReadonlyMap<string, ProjectBacklogTicketContext> {
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const descendantCountCache = new Map<string, number>();
  const ancestorCache = new Map<string, readonly ProjectTicket[]>();

  const countDescendants = (ticketId: string): number => {
    const cached = descendantCountCache.get(ticketId);
    if (cached !== undefined) {
      return cached;
    }
    const count = (hierarchy.childrenByParentId.get(ticketId) ?? []).reduce(
      (sum, child) => sum + 1 + countDescendants(child.id),
      0,
    );
    descendantCountCache.set(ticketId, count);
    return count;
  };

  const getAncestors = (ticketId: string): readonly ProjectTicket[] => {
    const cached = ancestorCache.get(ticketId);
    if (cached) {
      return cached;
    }
    const parentId = hierarchy.parentByChildId.get(ticketId);
    if (!parentId) {
      ancestorCache.set(ticketId, []);
      return [];
    }

    const parent = ticketById.get(parentId);
    if (!parent) {
      ancestorCache.set(ticketId, []);
      return [];
    }

    const ancestors = [...getAncestors(parentId), parent];
    ancestorCache.set(ticketId, ancestors);
    return ancestors;
  };

  return new Map(
    tickets.map((ticket) => [
      ticket.id,
      {
        ancestors: getAncestors(ticket.id),
        directChildren: hierarchy.childrenByParentId.get(ticket.id) ?? [],
        descendantCount: countDescendants(ticket.id),
        planningState: getProjectBacklogPlanningState(ticket),
      } satisfies ProjectBacklogTicketContext,
    ]),
  );
}

export function buildVisibleBacklogHierarchy(
  tickets: readonly ProjectTicket[],
  filteredTickets: readonly ProjectTicket[],
): {
  visibleTickets: readonly ProjectTicket[];
  visibleHierarchy: ProjectTicketHierarchy;
  matchedTicketIds: ReadonlySet<string>;
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
} {
  const fullHierarchy = buildProjectTicketHierarchy(tickets);
  const contextByTicketId = buildProjectBacklogTicketContext(tickets, fullHierarchy);
  const matchedTicketIds = new Set(filteredTickets.map((ticket) => ticket.id));
  const visibleTicketIds = new Set(matchedTicketIds);

  for (const ticket of filteredTickets) {
    for (const ancestor of contextByTicketId.get(ticket.id)?.ancestors ?? []) {
      visibleTicketIds.add(ancestor.id);
    }
  }

  const visibleTickets = tickets
    .filter((ticket) => visibleTicketIds.has(ticket.id))
    .sort(compareProjectBacklogTickets);

  return {
    visibleTickets,
    visibleHierarchy: buildProjectTicketHierarchy(visibleTickets),
    matchedTicketIds,
    contextByTicketId,
  };
}

export function buildProjectBacklogPlanningLanes(
  tickets: readonly ProjectTicket[],
): readonly ProjectBacklogPlanningLane[] {
  const grouped = new Map<ProjectBacklogPlanningState, ProjectTicket[]>();
  for (const ticket of tickets) {
    const state = getProjectBacklogPlanningState(ticket);
    const current = grouped.get(state) ?? [];
    current.push(ticket);
    grouped.set(state, current);
  }

  return projectBacklogPlanningLaneOrder.map((state) => ({
    id: state,
    label: projectBacklogPlanningMeta[state].label,
    description: projectBacklogPlanningMeta[state].description,
    tickets: grouped.get(state) ?? [],
  }));
}

export function buildProjectBacklogOwnershipGroups(
  tickets: readonly ProjectTicket[],
): readonly ProjectBacklogOwnershipGroup[] {
  const groups = new Map<string, ProjectTicket[]>();
  for (const ticket of tickets) {
    const label = ticket.assignee?.trim() || "Unassigned";
    const current = groups.get(label) ?? [];
    current.push(ticket);
    groups.set(label, current);
  }

  return [...groups.entries()]
    .map(([label, groupTickets]) => ({
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unassigned",
      label,
      tickets: groupTickets,
      needsPlanCount: groupTickets.filter(
        (ticket) => getProjectBacklogPlanningState(ticket) !== "ready",
      ).length,
      withSubtasksCount: groupTickets.filter((ticket) => (ticket.subtaskCount ?? 0) > 0).length,
    }))
    .sort((left, right) => {
      if (left.label === "Unassigned") return -1;
      if (right.label === "Unassigned") return 1;
      const countDelta = right.tickets.length - left.tickets.length;
      if (countDelta !== 0) return countDelta;
      return left.label.localeCompare(right.label);
    });
}
