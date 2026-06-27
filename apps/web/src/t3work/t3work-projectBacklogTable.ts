export {
  defaultProjectBacklogTableVisibleColumns,
  getDefaultProjectBacklogTableSortDirection,
  projectBacklogTableColumnOptions,
  projectBacklogTableColumnValues,
  projectBacklogTableGroupOptions,
  projectBacklogTableSortOptions,
} from "./t3work-projectBacklogTableMeta";
export type {
  ProjectBacklogTableColumnId,
  ProjectBacklogTableGroupBy,
  ProjectBacklogTableSortBy,
  ProjectBacklogTableSortDirection,
} from "./t3work-projectBacklogTableMeta";

import type { ProjectBacklogTicketContext } from "./t3work-projectBacklogPresentation";
import type { ProjectTicket } from "./t3work-types";

export { buildProjectBacklogTableGroups } from "./t3work-projectBacklogTableGroupBuild";

export interface ProjectBacklogTableRow {
  ticket: ProjectTicket;
  depth: number;
  isContextOnly: boolean;
}

export interface ProjectBacklogTableGroup {
  id: string;
  label: string;
  description?: string;
  matchedCount: number;
  contextCount: number;
  rows: readonly ProjectBacklogTableRow[];
}

export function areProjectBacklogTableRowsEqual(
  left: ProjectBacklogTableRow,
  right: ProjectBacklogTableRow,
): boolean {
  return (
    left.ticket === right.ticket &&
    left.depth === right.depth &&
    left.isContextOnly === right.isContextOnly
  );
}

function areProjectBacklogTableRowListsEqual(
  left: readonly ProjectBacklogTableRow[],
  right: readonly ProjectBacklogTableRow[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((row, index) => areProjectBacklogTableRowsEqual(row, right[index]!));
}

export function areProjectBacklogTableGroupsEqual(
  left: ProjectBacklogTableGroup,
  right: ProjectBacklogTableGroup,
): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.description === right.description &&
    left.matchedCount === right.matchedCount &&
    left.contextCount === right.contextCount &&
    areProjectBacklogTableRowListsEqual(left.rows, right.rows)
  );
}

export function getProjectBacklogTableExpandableTicketIds(
  rows: readonly ProjectBacklogTableRow[],
): ReadonlySet<string> {
  const rowTicketIds = new Set(rows.map((row) => row.ticket.id));
  const expandableTicketIds = new Set<string>();

  for (const row of rows) {
    if (row.ticket.parentId && rowTicketIds.has(row.ticket.parentId)) {
      expandableTicketIds.add(row.ticket.parentId);
    }
  }

  return expandableTicketIds;
}

export function filterVisibleProjectBacklogTableRows({
  rows,
  contextByTicketId,
  collapsedTicketIds,
}: {
  rows: readonly ProjectBacklogTableRow[];
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
  collapsedTicketIds: ReadonlySet<string>;
}): readonly ProjectBacklogTableRow[] {
  if (collapsedTicketIds.size === 0) {
    return rows;
  }

  return rows.filter(
    (row) =>
      !(contextByTicketId.get(row.ticket.id)?.ancestors ?? []).some((ancestor) =>
        collapsedTicketIds.has(ancestor.id),
      ),
  );
}
