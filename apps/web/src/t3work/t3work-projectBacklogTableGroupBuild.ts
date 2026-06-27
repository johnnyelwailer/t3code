/**
 * Builds the grouped, hierarchy-ordered rows for the backlog table: buckets
 * sorted tickets by the active grouping, threads ancestor context rows, and
 * emits a depth-ordered tree per group. Split out of t3work-projectBacklogTable.ts.
 */

import type { ProjectBacklogTicketContext } from "./t3work-projectBacklogPresentation";
import type {
  ProjectBacklogTableGroup,
  ProjectBacklogTableRow,
} from "./t3work-projectBacklogTable";
import type {
  ProjectBacklogTableGroupBy,
  ProjectBacklogTableSortBy,
  ProjectBacklogTableSortDirection,
} from "./t3work-projectBacklogTableMeta";
import {
  compareProjectBacklogTableGroupLabels,
  getProjectBacklogTableGroupDescriptor,
} from "./t3work-projectBacklogTableGrouping";
import { sortProjectBacklogTableTickets } from "./t3work-projectBacklogTableSorting";
import type { ProjectTicket } from "./t3work-types";

interface ProjectBacklogTableGroupBucket {
  id: string;
  label: string;
  description?: string;
  order: number;
  matchedCount: number;
  rowsByTicketId: Map<string, ProjectBacklogTableRow>;
  matchedTicketIds: Set<string>;
  sortIndexByTicketId: Map<string, number>;
}

function buildHierarchyOrderedRows({
  rowsByTicketId,
  matchedTicketIds,
  sortIndexByTicketId,
  contextByTicketId,
}: {
  rowsByTicketId: ReadonlyMap<string, ProjectBacklogTableRow>;
  matchedTicketIds: ReadonlySet<string>;
  sortIndexByTicketId: ReadonlyMap<string, number>;
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
}): ProjectBacklogTableRow[] {
  const rowIds = new Set(rowsByTicketId.keys());
  const childIdsByParentId = new Map<string, string[]>();
  const rootIds: string[] = [];

  for (const row of rowsByTicketId.values()) {
    const parent = [...(contextByTicketId.get(row.ticket.id)?.ancestors ?? [])]
      .toReversed()
      .find((ancestor) => rowIds.has(ancestor.id));

    if (!parent) {
      rootIds.push(row.ticket.id);
      continue;
    }

    const current = childIdsByParentId.get(parent.id) ?? [];
    current.push(row.ticket.id);
    childIdsByParentId.set(parent.id, current);
  }

  const compareIds = (left: string, right: string) =>
    (sortIndexByTicketId.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (sortIndexByTicketId.get(right) ?? Number.MAX_SAFE_INTEGER) ||
    rowsByTicketId
      .get(left)!
      .ticket.ref.displayId.localeCompare(
        rowsByTicketId.get(right)!.ticket.ref.displayId,
        undefined,
        {
          numeric: true,
        },
      );

  const output: ProjectBacklogTableRow[] = [];
  const visited = new Set<string>();
  const visit = (ticketId: string, depth: number) => {
    if (visited.has(ticketId)) return;
    visited.add(ticketId);
    const row = rowsByTicketId.get(ticketId);
    if (!row) return;
    output.push({
      ...row,
      depth,
      isContextOnly: !matchedTicketIds.has(ticketId),
    });
    for (const childId of (childIdsByParentId.get(ticketId) ?? []).toSorted(compareIds)) {
      visit(childId, depth + 1);
    }
  };

  for (const rootId of rootIds.toSorted(compareIds)) {
    visit(rootId, 0);
  }

  for (const ticketId of [...rowIds].toSorted(compareIds)) {
    visit(ticketId, 0);
  }

  return output;
}

export function buildProjectBacklogTableGroups({
  tickets,
  contextByTicketId,
  groupBy,
  sortBy,
  sortDirection,
}: {
  tickets: readonly ProjectTicket[];
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
  groupBy: ProjectBacklogTableGroupBy;
  sortBy: ProjectBacklogTableSortBy;
  sortDirection: ProjectBacklogTableSortDirection;
}): readonly ProjectBacklogTableGroup[] {
  const sortedTickets = sortProjectBacklogTableTickets({ tickets, sortBy, sortDirection });
  const groups = new Map<string, ProjectBacklogTableGroupBucket>();

  sortedTickets.forEach((ticket, sortedIndex) => {
    const context = contextByTicketId.get(ticket.id);
    const group = getProjectBacklogTableGroupDescriptor(ticket, groupBy, context);

    let current = groups.get(group.id);
    if (!current) {
      current = {
        id: group.id,
        label: group.label,
        ...(group.description ? { description: group.description } : {}),
        order: group.order,
        matchedCount: 0,
        rowsByTicketId: new Map<string, ProjectBacklogTableRow>(),
        matchedTicketIds: new Set<string>(),
        sortIndexByTicketId: new Map<string, number>(),
      };
      groups.set(group.id, current);
    }

    current.matchedCount += 1;
    current.matchedTicketIds.add(ticket.id);
    const chain = [...(context?.ancestors ?? []), ticket];
    chain.forEach((chainTicket, depth) => {
      const existingSortIndex = current.sortIndexByTicketId.get(chainTicket.id);
      if (existingSortIndex === undefined || sortedIndex < existingSortIndex) {
        current.sortIndexByTicketId.set(chainTicket.id, sortedIndex);
      }
      const existing = current.rowsByTicketId.get(chainTicket.id);
      if (existing) {
        if (chainTicket.id === ticket.id) {
          existing.isContextOnly = false;
        }
        if (depth < existing.depth) {
          existing.depth = depth;
        }
        return;
      }

      current.rowsByTicketId.set(chainTicket.id, {
        ticket: chainTicket,
        depth,
        isContextOnly: chainTicket.id !== ticket.id,
      });
    });
  });

  return [...groups.values()]
    .toSorted((left, right) => {
      const orderDelta = left.order - right.order;
      if (orderDelta !== 0) return orderDelta;
      return compareProjectBacklogTableGroupLabels(left.label, right.label);
    })
    .map((group) => {
      const nextGroup: ProjectBacklogTableGroup = {
        id: group.id,
        label: group.label,
        matchedCount: group.matchedCount,
        contextCount: group.rowsByTicketId.size - group.matchedCount,
        rows: buildHierarchyOrderedRows({
          rowsByTicketId: group.rowsByTicketId,
          matchedTicketIds: group.matchedTicketIds,
          sortIndexByTicketId: group.sortIndexByTicketId,
          contextByTicketId,
        }),
      };

      if (group.description) {
        nextGroup.description = group.description;
      }

      return nextGroup;
    });
}
