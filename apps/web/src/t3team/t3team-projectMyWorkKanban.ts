import { compareProjectBacklogTickets } from "./t3team-projectBacklogUtils";
import {
  getProjectTicketKanbanColumnId,
  type ProjectTicketKanbanColumn,
  type ProjectTicketKanbanColumns,
} from "./t3team-projectTicketStatus";
import type {
  ProjectMyWorkKanbanLaneOption,
  ProjectMyWorkVisibleHierarchy,
} from "./t3team-projectMyWorkShared";
import type { ProjectTicketHierarchy } from "./t3team-ticketHierarchy";
import type { ProjectTicket } from "./t3team-types";

export function filterProjectMyWorkKanbanTicketsByHiddenColumns(
  tickets: readonly ProjectTicket[],
  hiddenKanbanColumnIds: ReadonlyArray<string>,
): ProjectTicket[] {
  if (hiddenKanbanColumnIds.length === 0) {
    return [...tickets];
  }

  const hiddenKanbanColumnIdSet = new Set(hiddenKanbanColumnIds);
  return tickets.filter(
    (ticket) => !hiddenKanbanColumnIdSet.has(getProjectTicketKanbanColumnId(ticket.status)),
  );
}

export function filterProjectMyWorkKanbanColumnsByHiddenColumns(
  columns: ProjectTicketKanbanColumns,
  hiddenKanbanColumnIds: ReadonlyArray<string>,
): ProjectTicketKanbanColumns {
  if (hiddenKanbanColumnIds.length === 0) {
    return columns;
  }

  const hiddenKanbanColumnIdSet = new Set(hiddenKanbanColumnIds);
  return columns.filter((column) => !hiddenKanbanColumnIdSet.has(column.id));
}

export function buildProjectMyWorkKanbanLaneOptions(
  columns: ProjectTicketKanbanColumns,
): ReadonlyArray<ProjectMyWorkKanbanLaneOption> {
  return columns.map((column) => ({
    id: column.id,
    title: column.title,
    count: column.items.length,
  }));
}

function resolveVisibleDescendantColumnId(input: {
  ticketId: string;
  hierarchy: ProjectTicketHierarchy;
  columnIdByTicketId: ReadonlyMap<string, string>;
  cache: Map<string, string | null>;
}): string | null {
  const cached = input.cache.get(input.ticketId);
  if (cached !== undefined) {
    return cached;
  }

  const directColumnId = input.columnIdByTicketId.get(input.ticketId);
  if (directColumnId) {
    input.cache.set(input.ticketId, directColumnId);
    return directColumnId;
  }

  for (const child of input.hierarchy.childrenByParentId.get(input.ticketId) ?? []) {
    const descendantColumnId = resolveVisibleDescendantColumnId({
      ticketId: child.id,
      hierarchy: input.hierarchy,
      columnIdByTicketId: input.columnIdByTicketId,
      cache: input.cache,
    });
    if (descendantColumnId) {
      input.cache.set(input.ticketId, descendantColumnId);
      return descendantColumnId;
    }
  }

  input.cache.set(input.ticketId, null);
  return null;
}

export function buildProjectMyWorkFlatKanbanColumns(input: {
  columns: ProjectTicketKanbanColumns;
  visibleHierarchy: ProjectMyWorkVisibleHierarchy;
  hiddenKanbanColumnIds: ReadonlyArray<string>;
}): ProjectTicketKanbanColumns {
  if (input.hiddenKanbanColumnIds.length === 0) {
    return input.columns;
  }

  const hiddenKanbanColumnIdSet = new Set(input.hiddenKanbanColumnIds);
  const columns = input.columns.map(
    (column) => ({ ...column, items: [...column.items] }) satisfies ProjectTicketKanbanColumn,
  );
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const columnIdByTicketId = new Map<string, string>();
  for (const column of columns) {
    for (const ticket of column.items) {
      columnIdByTicketId.set(ticket.id, column.id);
    }
  }

  const descendantColumnIdCache = new Map<string, string | null>();
  for (const row of input.visibleHierarchy.rows) {
    if (!row.isContextOnly) {
      continue;
    }

    const ownColumnId = getProjectTicketKanbanColumnId(row.ticket.status);
    if (!hiddenKanbanColumnIdSet.has(ownColumnId)) {
      continue;
    }

    const targetColumnId = resolveVisibleDescendantColumnId({
      ticketId: row.ticket.id,
      hierarchy: input.visibleHierarchy.hierarchy,
      columnIdByTicketId,
      cache: descendantColumnIdCache,
    });
    if (!targetColumnId || hiddenKanbanColumnIdSet.has(targetColumnId)) {
      continue;
    }

    const targetColumn = columnById.get(targetColumnId);
    if (!targetColumn || targetColumn.items.some((ticket) => ticket.id === row.ticket.id)) {
      continue;
    }

    targetColumn.items.push(row.ticket);
    columnIdByTicketId.set(row.ticket.id, targetColumnId);
  }

  const rowIndexByTicketId = new Map(
    input.visibleHierarchy.rows.map((row, index) => [row.ticket.id, index]),
  );
  for (const column of columns) {
    column.items.sort(
      (left, right) =>
        (rowIndexByTicketId.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (rowIndexByTicketId.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
        compareProjectBacklogTickets(left, right),
    );
  }

  return columns;
}
