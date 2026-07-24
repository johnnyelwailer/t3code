import {
  getProjectBacklogAssigneeFilterValue,
  normalizeProjectBacklogAssigneeName,
  PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
  type ProjectBacklogAssigneeFilterScope,
} from "~/t3team/t3team-projectBacklogFilterOptions";
import {
  getProjectBacklogAssigneeFilterCategory,
  isProjectTicketSubtask,
} from "~/t3team/t3team-projectBacklogTicketKinds";
import type { ProjectTicket } from "~/t3team/t3team-types";

function ticketDirectlyMatchesAssigneeFilter(
  ticket: ProjectTicket,
  assigneeFilter: string,
  assigneeFilterName?: string,
): boolean {
  if (getProjectBacklogAssigneeFilterValue(ticket) === assigneeFilter) {
    return true;
  }

  if (!assigneeFilterName) {
    return false;
  }

  return normalizeProjectBacklogAssigneeName(ticket.assignee) === assigneeFilterName;
}

export type ProjectBacklogAssigneeFilterContext = {
  assigneeFilter: string;
  assigneeFilterName: string | undefined;
  scope: ProjectBacklogAssigneeFilterScope;
  ticketById: ReadonlyMap<string, ProjectTicket>;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  storyIncludedCache: Map<string, boolean>;
  epicIncludedCache: Map<string, boolean>;
};

export function buildProjectBacklogChildrenByParentId(
  tickets: readonly ProjectTicket[],
): ReadonlyMap<string, readonly ProjectTicket[]> {
  const childrenByParentId = new Map<string, ProjectTicket[]>();
  for (const ticket of tickets) {
    if (!ticket.parentId) {
      continue;
    }
    const siblings = childrenByParentId.get(ticket.parentId) ?? [];
    siblings.push(ticket);
    childrenByParentId.set(ticket.parentId, siblings);
  }
  return childrenByParentId;
}

function collectProjectBacklogDescendantSubtasks(
  ticketId: string,
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>,
  visitedTicketIds = new Set<string>(),
): readonly ProjectTicket[] {
  if (visitedTicketIds.has(ticketId)) {
    return [];
  }
  visitedTicketIds.add(ticketId);

  const subtasks: ProjectTicket[] = [];
  for (const child of childrenByParentId.get(ticketId) ?? []) {
    if (isProjectTicketSubtask(child)) {
      subtasks.push(child);
    }
    subtasks.push(
      ...collectProjectBacklogDescendantSubtasks(child.id, childrenByParentId, visitedTicketIds),
    );
  }
  return subtasks;
}

function collectProjectBacklogDescendants(
  ticketId: string,
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>,
  visitedTicketIds = new Set<string>(),
): readonly ProjectTicket[] {
  if (visitedTicketIds.has(ticketId)) {
    return [];
  }
  visitedTicketIds.add(ticketId);

  const descendants: ProjectTicket[] = [];
  for (const child of childrenByParentId.get(ticketId) ?? []) {
    descendants.push(child);
    descendants.push(
      ...collectProjectBacklogDescendants(child.id, childrenByParentId, visitedTicketIds),
    );
  }
  return descendants;
}

function isStoryIncludedByAssigneeFilter(
  ticket: ProjectTicket,
  context: ProjectBacklogAssigneeFilterContext,
): boolean {
  const cached = context.storyIncludedCache.get(ticket.id);
  if (cached !== undefined) {
    return cached;
  }

  let included = false;
  if (context.scope.story) {
    included =
      ticketDirectlyMatchesAssigneeFilter(
        ticket,
        context.assigneeFilter,
        context.assigneeFilterName,
      ) ||
      collectProjectBacklogDescendantSubtasks(ticket.id, context.childrenByParentId).some(
        (subtask) =>
          ticketDirectlyMatchesAssigneeFilter(
            subtask,
            context.assigneeFilter,
            context.assigneeFilterName,
          ),
      );
  }

  context.storyIncludedCache.set(ticket.id, included);
  return included;
}

function isEpicIncludedByAssigneeFilter(
  ticket: ProjectTicket,
  context: ProjectBacklogAssigneeFilterContext,
): boolean {
  const cached = context.epicIncludedCache.get(ticket.id);
  if (cached !== undefined) {
    return cached;
  }

  let included = false;
  if (context.scope.epic) {
    included =
      ticketDirectlyMatchesAssigneeFilter(
        ticket,
        context.assigneeFilter,
        context.assigneeFilterName,
      ) ||
      collectProjectBacklogDescendants(ticket.id, context.childrenByParentId).some((descendant) =>
        matchesAssigneeFilter(descendant, context),
      );
  }

  context.epicIncludedCache.set(ticket.id, included);
  return included;
}

function hasIncludingScopedAssigneeAncestor(
  ticket: ProjectTicket,
  context: ProjectBacklogAssigneeFilterContext,
): boolean {
  const visitedParentIds = new Set<string>();
  let currentParentId = ticket.parentId;

  while (currentParentId && !visitedParentIds.has(currentParentId)) {
    visitedParentIds.add(currentParentId);
    const parent = context.ticketById.get(currentParentId);
    if (!parent) {
      return false;
    }

    const parentCategory = getProjectBacklogAssigneeFilterCategory(parent);
    if (parentCategory === "story" && isStoryIncludedByAssigneeFilter(parent, context)) {
      return true;
    }
    if (parentCategory === "epic" && isEpicIncludedByAssigneeFilter(parent, context)) {
      return true;
    }

    currentParentId = parent.parentId;
  }

  return false;
}

export function matchesAssigneeFilter(
  ticket: ProjectTicket,
  context: ProjectBacklogAssigneeFilterContext,
): boolean {
  if (!context.assigneeFilter || context.assigneeFilter === PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL) {
    return true;
  }

  const category = getProjectBacklogAssigneeFilterCategory(ticket);
  if (category === "subtask") {
    if (context.scope.subtask) {
      return ticketDirectlyMatchesAssigneeFilter(
        ticket,
        context.assigneeFilter,
        context.assigneeFilterName,
      );
    }
    return hasIncludingScopedAssigneeAncestor(ticket, context);
  }

  if (category === "story") {
    return isStoryIncludedByAssigneeFilter(ticket, context);
  }

  return isEpicIncludedByAssigneeFilter(ticket, context);
}
