/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import {
  buildProjectBacklogTicketContext,
  buildVisibleBacklogHierarchy,
} from "./t3work-projectBacklogPresentation";
import type {
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
} from "./t3work-projectDashboardMyWorkState";
import { buildProjectTicketHierarchy, type ProjectTicketHierarchy } from "./t3work-ticketHierarchy";
import type { ProjectTicket } from "./t3work-types";
import { compareProjectMyWorkTickets } from "./t3work-projectMyWorkFiltering";
import {
  type ProjectMyWorkHierarchyRow,
  type ProjectMyWorkVisibleHierarchy,
} from "./t3work-projectMyWorkShared";
import {
  compareProjectBacklogTickets,
  getProjectTicketIssueTypeKey,
} from "./t3work-projectBacklogUtils";

function flattenProjectMyWorkHierarchyRows(
  hierarchy: ProjectTicketHierarchy,
  matchedTicketIds: ReadonlySet<string>,
  sortBy: ProjectMyWorkTableSortBy,
  sortDirection: ProjectMyWorkTableSortDirection,
): ReadonlyArray<ProjectMyWorkHierarchyRow> {
  const rows: ProjectMyWorkHierarchyRow[] = [];

  const visit = (parentId: string | null, depth: number) => {
    const siblings = (
      parentId ? (hierarchy.childrenByParentId.get(parentId) ?? []) : hierarchy.roots
    ).toSorted((left, right) => {
      const matchedDelta =
        Number(matchedTicketIds.has(right.id)) - Number(matchedTicketIds.has(left.id));
      if (matchedDelta !== 0) {
        return matchedDelta;
      }
      return compareProjectMyWorkTickets(left, right, sortBy, sortDirection);
    });

    for (const ticket of siblings) {
      rows.push({
        ticket,
        depth,
        isContextOnly: !matchedTicketIds.has(ticket.id),
      });
      visit(ticket.id, depth + 1);
    }
  };

  visit(null, 0);
  return rows;
}

export function buildProjectMyWorkVisibleHierarchy(
  tickets: readonly ProjectTicket[],
  matchedTickets: readonly ProjectTicket[],
  {
    sortBy,
    sortDirection,
    excludedVisibleTypeKeys = [],
  }: {
    sortBy: ProjectMyWorkTableSortBy;
    sortDirection: ProjectMyWorkTableSortDirection;
    excludedVisibleTypeKeys?: ReadonlyArray<string>;
  },
): ProjectMyWorkVisibleHierarchy {
  const presentation = buildVisibleBacklogHierarchy(tickets, matchedTickets, {
    includeDescendants: true,
  });
  const excludedVisibleTypeKeySet = new Set(excludedVisibleTypeKeys);
  const visibleTickets =
    excludedVisibleTypeKeySet.size === 0
      ? presentation.visibleTickets
      : presentation.visibleTickets.filter(
          (ticket) => !excludedVisibleTypeKeySet.has(getProjectTicketIssueTypeKey(ticket)),
        );
  const visibleHierarchy = buildProjectTicketHierarchy(visibleTickets);

  return {
    visibleTickets,
    hierarchy: visibleHierarchy,
    contextByTicketId: buildProjectBacklogTicketContext(visibleTickets, visibleHierarchy),
    matchedTicketIds: presentation.matchedTicketIds,
    rows: flattenProjectMyWorkHierarchyRows(
      visibleHierarchy,
      presentation.matchedTicketIds,
      sortBy,
      sortDirection,
    ),
  };
}
