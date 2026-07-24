import {
  compareProjectBacklogTickets,
  getProjectTicketIssueTypeKey,
} from "./t3team-projectBacklogUtils";
import type {
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
} from "./t3team-projectDashboardMyWorkState";
import { matchesProjectTicketStatusCategory } from "./t3team-projectTicketStatus";
import type { ProjectTicket } from "./t3team-types";
import {
  isProjectMyWorkTicket,
  type ProjectMyWorkIdentity,
  type ProjectMyWorkStatusCategory,
  type ProjectMyWorkTypeOption,
} from "./t3team-projectMyWorkShared";

function matchesStatusCategory(
  ticket: ProjectTicket,
  statusCategory: ProjectMyWorkStatusCategory,
): boolean {
  if (statusCategory === "all") {
    return true;
  }

  return matchesProjectTicketStatusCategory(ticket.status, statusCategory);
}

function buildProjectMyWorkSearchHaystack(
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

  return parts.join(" ").toLocaleLowerCase();
}

function compareMaybeText(
  left: string | undefined,
  right: string | undefined,
  direction: ProjectMyWorkTableSortDirection,
): number {
  const leftValue = left?.trim() || "";
  const rightValue = right?.trim() || "";
  const delta = leftValue.localeCompare(rightValue, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? delta : -delta;
}

function compareUpdatedAt(
  left: ProjectTicket,
  right: ProjectTicket,
  direction: ProjectMyWorkTableSortDirection,
): number {
  const leftTimestamp = Date.parse(left.updatedAt);
  const rightTimestamp = Date.parse(right.updatedAt);
  const leftValue = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
  const rightValue = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
  if (leftValue !== rightValue) {
    return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
  }

  return compareMaybeText(left.ref.displayId, right.ref.displayId, "asc");
}

export function compareProjectMyWorkTickets(
  left: ProjectTicket,
  right: ProjectTicket,
  sortBy: ProjectMyWorkTableSortBy,
  sortDirection: ProjectMyWorkTableSortDirection,
): number {
  switch (sortBy) {
    case "title": {
      const titleDelta = compareMaybeText(left.ref.title, right.ref.title, sortDirection);
      if (titleDelta !== 0) {
        return titleDelta;
      }
      break;
    }
    case "status": {
      const statusDelta = compareMaybeText(left.status, right.status, sortDirection);
      if (statusDelta !== 0) {
        return statusDelta;
      }
      break;
    }
    case "assignee": {
      const assigneeDelta = compareMaybeText(
        left.assignee ?? "Unassigned",
        right.assignee ?? "Unassigned",
        sortDirection,
      );
      if (assigneeDelta !== 0) {
        return assigneeDelta;
      }
      break;
    }
    case "updated": {
      const updatedDelta = compareUpdatedAt(left, right, sortDirection);
      if (updatedDelta !== 0) {
        return updatedDelta;
      }
      break;
    }
  }

  return compareProjectBacklogTickets(left, right);
}

export function sortProjectMyWorkTickets({
  tickets,
  sortBy,
  sortDirection,
}: {
  tickets: readonly ProjectTicket[];
  sortBy: ProjectMyWorkTableSortBy;
  sortDirection: ProjectMyWorkTableSortDirection;
}): ProjectTicket[] {
  return [...tickets].toSorted((left, right) =>
    compareProjectMyWorkTickets(left, right, sortBy, sortDirection),
  );
}

export function buildProjectMyWorkTypeOptions(
  tickets: readonly ProjectTicket[],
): ReadonlyArray<ProjectMyWorkTypeOption> {
  const options = new Map<string, ProjectMyWorkTypeOption>();

  for (const ticket of tickets) {
    const label = (ticket.issueType ?? ticket.ref.type ?? "Issue").trim() || "Issue";
    const key = getProjectTicketIssueTypeKey(ticket) || "issue";
    if (!options.has(key)) {
      options.set(key, { key, label });
    }
  }

  return Array.from(options.values()).toSorted((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function filterProjectMyWorkTickets({
  tickets,
  identity,
  query,
  statusCategory,
  excludedTypeKeys = [],
  selectedPriority,
  selectedStatus,
}: {
  tickets: readonly ProjectTicket[];
  identity: ProjectMyWorkIdentity;
  query: string;
  statusCategory: ProjectMyWorkStatusCategory;
  excludedTypeKeys?: ReadonlyArray<string>;
  selectedPriority: string;
  selectedStatus: string;
}): ProjectTicket[] {
  const excludedTypeKeySet = new Set(excludedTypeKeys);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));

  return tickets
    .filter((ticket) => isProjectMyWorkTicket(ticket, identity))
    .filter((ticket) => matchesStatusCategory(ticket, statusCategory))
    .filter((ticket) => !excludedTypeKeySet.has(getProjectTicketIssueTypeKey(ticket)))
    .filter((ticket) => selectedPriority === "all" || ticket.priority === selectedPriority)
    .filter((ticket) => selectedStatus === "all" || ticket.status === selectedStatus)
    .filter((ticket) => {
      if (!normalizedQuery) {
        return true;
      }

      return buildProjectMyWorkSearchHaystack(ticket, ticketById).includes(normalizedQuery);
    })
    .toSorted(compareProjectBacklogTickets);
}
