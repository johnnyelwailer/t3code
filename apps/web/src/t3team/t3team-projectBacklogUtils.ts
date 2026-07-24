import {
  defaultProjectBacklogAssigneeFilterScope,
  defaultProjectBacklogVisibleIssueTypes,
  getProjectBacklogAssigneeFilterValue,
  normalizeProjectBacklogAssigneeName,
  PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
  resolveProjectBacklogAssigneeFilter,
  type ProjectBacklogAssigneeFilterScope,
  type ProjectBacklogIssueTypeFilterKey,
} from "~/t3team/t3team-projectBacklogFilterOptions";
import {
  buildProjectBacklogChildrenByParentId,
  matchesAssigneeFilter,
  type ProjectBacklogAssigneeFilterContext,
} from "~/t3team/t3team-projectBacklogAssigneeFilterMatch";
import { parseProjectBacklogVisibleIssueTypes } from "~/t3team/t3team-projectBacklogFilterSerialization";
import {
  getProjectBacklogIssueTypeFilterCategory,
  hasProjectBacklogAssignee,
  hasProjectBacklogEstimate,
} from "~/t3team/t3team-projectBacklogTicketKinds";
import type { ProjectTicket } from "~/t3team/t3team-types";

export {
  buildProjectBacklogAssigneeFilterOptions,
  buildProjectBacklogLabelFilterOptions,
  defaultProjectBacklogAssigneeFilterScope,
  defaultProjectBacklogVisibleIssueTypes,
  getProjectBacklogAssigneeFilterValue,
  PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
  PROJECT_BACKLOG_ASSIGNEE_FILTER_UNASSIGNED,
  projectBacklogAssigneeFilterScopeOptions,
  projectBacklogIssueTypeFilterOptions,
  resolveProjectBacklogAssigneeFilter,
} from "~/t3team/t3team-projectBacklogFilterOptions";
export type {
  ProjectBacklogAssigneeFilterOption,
  ProjectBacklogAssigneeFilterScope,
  ProjectBacklogAssigneeFilterScopeKey,
  ProjectBacklogIssueTypeFilterKey,
  ProjectBacklogLabelFilterOption,
} from "~/t3team/t3team-projectBacklogFilterOptions";
export {
  areProjectBacklogAssigneeFilterScopesEqual,
  parseProjectBacklogAssigneeFilterScope,
  parseProjectBacklogAssigneeFilterScopeRouteValue,
  parseProjectBacklogSelectedLabels,
  parseProjectBacklogSelectedLabelsRouteValue,
  parseProjectBacklogSelectedQuickFilterIds,
  parseProjectBacklogSelectedQuickFilterIdsRouteValue,
  parseProjectBacklogVisibleIssueTypes,
  parseProjectBacklogVisibleIssueTypesRouteValue,
  serializeProjectBacklogAssigneeFilterScopeRouteValue,
  serializeProjectBacklogSelectedLabelsRouteValue,
  serializeProjectBacklogSelectedQuickFilterIdsRouteValue,
  serializeProjectBacklogVisibleIssueTypesRouteValue,
} from "~/t3team/t3team-projectBacklogFilterSerialization";
export {
  getProjectBacklogAssigneeFilterCategory,
  getProjectBacklogIssueTypeFilterCategory,
  getProjectTicketIssueTypeKey,
  hasProjectBacklogAssignee,
  hasProjectBacklogEstimate,
  isProjectTicketEpic,
  isProjectTicketHourTracked,
  isProjectTicketSubtask,
} from "~/t3team/t3team-projectBacklogTicketKinds";

export type ProjectBacklogFocusFilter = "all" | "needs-plan" | "unassigned" | "with-subtasks";

function matchesFocusFilter(
  ticket: ProjectTicket,
  focusFilter: ProjectBacklogFocusFilter,
): boolean {
  switch (focusFilter) {
    case "needs-plan":
      return !hasProjectBacklogAssignee(ticket) || !hasProjectBacklogEstimate(ticket);
    case "unassigned":
      return !hasProjectBacklogAssignee(ticket);
    case "with-subtasks":
      return (ticket.subtaskCount ?? 0) > 0;
    default:
      return true;
  }
}

function buildProjectBacklogSearchHaystack(
  ticket: ProjectTicket,
  ticketById: ReadonlyMap<string, ProjectTicket>,
): string {
  const parts = [
    ticket.ref.displayId,
    ticket.ref.title,
    ticket.description ?? "",
    ticket.status,
    ticket.priority ?? "",
    ticket.assignee ?? "",
    ticket.issueType ?? ticket.ref.type ?? "",
    ticket.sprintName ?? "",
    ticket.sprintGoal ?? "",
  ];

  const visitedAncestorIds = new Set<string>();
  let currentParentId = ticket.parentId;

  while (currentParentId && !visitedAncestorIds.has(currentParentId)) {
    visitedAncestorIds.add(currentParentId);
    const parent = ticketById.get(currentParentId);
    if (!parent) {
      parts.push(currentParentId);
      break;
    }

    parts.push(parent.ref.displayId, parent.ref.title, parent.issueType ?? parent.ref.type ?? "");
    currentParentId = parent.parentId;
  }

  return parts.join(" ").toLowerCase();
}

export function compareProjectBacklogTickets(left: ProjectTicket, right: ProjectTicket): number {
  const scoreLeft =
    Number(!hasProjectBacklogEstimate(left)) * 2 + Number(!hasProjectBacklogAssignee(left));
  const scoreRight =
    Number(!hasProjectBacklogEstimate(right)) * 2 + Number(!hasProjectBacklogAssignee(right));
  const scoreDelta = scoreRight - scoreLeft;
  if (scoreDelta !== 0) return scoreDelta;

  const updatedDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (!Number.isNaN(updatedDelta) && updatedDelta !== 0) return updatedDelta;

  return left.ref.displayId.localeCompare(right.ref.displayId, undefined, { numeric: true });
}

export function filterProjectBacklogTickets({
  tickets,
  query,
  focusFilter,
  assigneeFilter = PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
  assigneeFilterScope = defaultProjectBacklogAssigneeFilterScope,
  visibleIssueTypes = defaultProjectBacklogVisibleIssueTypes,
  selectedLabels = [],
}: {
  tickets: readonly ProjectTicket[];
  query: string;
  focusFilter: ProjectBacklogFocusFilter;
  assigneeFilter?: string;
  assigneeFilterScope?: ProjectBacklogAssigneeFilterScope;
  visibleIssueTypes?: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>;
  selectedLabels?: ReadonlyArray<string>;
}): ProjectTicket[] {
  const normalizedQuery = query.trim().toLowerCase();
  const resolvedAssigneeFilter = resolveProjectBacklogAssigneeFilter(tickets, assigneeFilter);
  const resolvedAssigneeFilterName = normalizeProjectBacklogAssigneeName(
    tickets.find(
      (ticket) => getProjectBacklogAssigneeFilterValue(ticket) === resolvedAssigneeFilter,
    )?.assignee,
  );
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const assigneeFilterContext: ProjectBacklogAssigneeFilterContext = {
    assigneeFilter: resolvedAssigneeFilter,
    assigneeFilterName: resolvedAssigneeFilterName,
    scope: assigneeFilterScope,
    ticketById,
    childrenByParentId: buildProjectBacklogChildrenByParentId(tickets),
    storyIncludedCache: new Map(),
    epicIncludedCache: new Map(),
  };
  const visibleIssueTypeSet = new Set(
    parseProjectBacklogVisibleIssueTypes(visibleIssueTypes) ??
      defaultProjectBacklogVisibleIssueTypes,
  );
  const selectedLabelSet = new Set(selectedLabels);
  return tickets
    .filter((ticket) => visibleIssueTypeSet.has(getProjectBacklogIssueTypeFilterCategory(ticket)))
    .filter((ticket) => matchesFocusFilter(ticket, focusFilter))
    .filter((ticket) => matchesAssigneeFilter(ticket, assigneeFilterContext))
    .filter((ticket) => {
      if (selectedLabelSet.size === 0) return true;
      return (ticket.labels ?? []).some((label) => selectedLabelSet.has(label));
    })
    .filter((ticket) => {
      if (!normalizedQuery) return true;
      const haystack = buildProjectBacklogSearchHaystack(ticket, ticketById);
      return haystack.includes(normalizedQuery);
    })
    .toSorted(compareProjectBacklogTickets);
}

export function summarizeProjectBacklog(tickets: readonly ProjectTicket[]) {
  return {
    total: tickets.length,
    needsPlan: tickets.filter(
      (ticket) => !hasProjectBacklogAssignee(ticket) || !hasProjectBacklogEstimate(ticket),
    ).length,
    unassigned: tickets.filter((ticket) => !hasProjectBacklogAssignee(ticket)).length,
    needsEstimate: tickets.filter((ticket) => !hasProjectBacklogEstimate(ticket)).length,
    ready: tickets.filter(
      (ticket) => hasProjectBacklogAssignee(ticket) && hasProjectBacklogEstimate(ticket),
    ).length,
    withSubtasks: tickets.filter((ticket) => (ticket.subtaskCount ?? 0) > 0).length,
  };
}
