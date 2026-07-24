import { getProjectTicketIssueTypeKey } from "~/t3team/t3team-projectBacklogUtils";
import {
  buildProjectDashboardKanbanLaneHierarchy,
  type TicketHierarchy,
} from "~/t3team/t3team-projectDashboardKanbanHierarchy";
import {
  PROJECT_DASHBOARD_KANBAN_MATRIX_MIN_CARD_ROWS,
  PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP,
} from "~/t3team/t3team-projectDashboardKanbanMatrix";
import type {
  ProjectTicketKanbanColumnId,
  ProjectTicketKanbanColumns,
} from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type ProjectDashboardKanbanMatrixHierarchyPlacement = {
  placementKey: string;
  ticket: ProjectTicket;
  columnId: ProjectTicketKanbanColumnId;
  columnIndex: number;
  rowStart: number;
  rowSpan: number;
  laneHierarchy: TicketHierarchy;
  laneTicketIds: ReadonlySet<string>;
  isContextOnly: boolean;
};

export type ProjectDashboardKanbanMatrixHierarchyLayout = {
  placements: readonly ProjectDashboardKanbanMatrixHierarchyPlacement[];
  maxRow: number;
};

export function getProjectDashboardKanbanMatrixRowSpanForHeight(input: {
  heightPx: number;
  rowHeightPx: number;
  rowGapPx: number;
}): number {
  const { heightPx, rowHeightPx, rowGapPx } = input;
  if (!Number.isFinite(heightPx) || heightPx <= 0) return 1;
  return Math.max(1, Math.ceil((heightPx + rowGapPx) / (rowHeightPx + rowGapPx)));
}

function countLaneDescendants(
  parentId: string,
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(parentId);
  if (cached !== undefined) return cached;

  const children = childrenByParentId.get(parentId) ?? [];
  const total = children.reduce(
    (count, child) => count + 1 + countLaneDescendants(child.id, childrenByParentId, cache),
    0,
  );
  cache.set(parentId, total);
  return total;
}

function getProjectDashboardKanbanMatrixHierarchyRows(
  ticket: ProjectTicket,
  descendantCount: number,
): number {
  let rows = PROJECT_DASHBOARD_KANBAN_MATRIX_MIN_CARD_ROWS;
  const issueType = getProjectTicketIssueTypeKey(ticket);
  const titleLength = ticket.ref.title.trim().length;

  if (issueType.includes("epic")) rows += 1;
  if (ticket.assignee?.trim()) rows += 1;
  if (titleLength > 72) rows += 1;
  if (titleLength > 120) rows += 1;
  if (descendantCount > 0) rows += 1 + descendantCount * 3;

  return rows;
}

export function buildProjectDashboardKanbanMatrixHierarchyLayout(input: {
  kanbanColumns: ProjectTicketKanbanColumns;
  parentChildGroups: TicketHierarchy;
}): ProjectDashboardKanbanMatrixHierarchyLayout {
  const placements: ProjectDashboardKanbanMatrixHierarchyPlacement[] = [];
  let maxRow = 0;

  for (const [columnIndex, column] of input.kanbanColumns.entries()) {
    const laneHierarchy = buildProjectDashboardKanbanLaneHierarchy(
      input.parentChildGroups,
      column.items,
    );
    const laneRoots = [...laneHierarchy.roots, ...laneHierarchy.unresolvedChildren];
    const laneTicketIds = new Set(column.items.map((ticket) => ticket.id));
    const descendantCountCache = new Map<string, number>();
    let nextRow = 1;

    for (const ticket of laneRoots) {
      const descendantCount = countLaneDescendants(
        ticket.id,
        laneHierarchy.childrenByParentId,
        descendantCountCache,
      );
      const rowSpan = getProjectDashboardKanbanMatrixHierarchyRows(ticket, descendantCount);
      const rowEnd = nextRow + rowSpan - 1;
      placements.push({
        placementKey: `${column.id}:${ticket.id}`,
        ticket,
        columnId: column.id,
        columnIndex,
        rowStart: nextRow,
        rowSpan,
        laneHierarchy,
        laneTicketIds,
        isContextOnly: !laneTicketIds.has(ticket.id),
      });
      maxRow = Math.max(maxRow, rowEnd);
      nextRow = rowEnd + PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP + 1;
    }
  }

  return { placements, maxRow };
}

export function resolveProjectDashboardKanbanMatrixHierarchyLayout(input: {
  layout: ProjectDashboardKanbanMatrixHierarchyLayout;
  measuredRowSpanByPlacementKey: ReadonlyMap<string, number>;
}): ProjectDashboardKanbanMatrixHierarchyLayout {
  const placementsByColumn = new Map<number, ProjectDashboardKanbanMatrixHierarchyPlacement[]>();

  for (const placement of input.layout.placements) {
    const existing = placementsByColumn.get(placement.columnIndex) ?? [];
    existing.push(placement);
    placementsByColumn.set(placement.columnIndex, existing);
  }

  const placements: ProjectDashboardKanbanMatrixHierarchyPlacement[] = [];
  let maxRow = 0;

  for (const columnIndex of [...placementsByColumn.keys()].toSorted(
    (left, right) => left - right,
  )) {
    const columnPlacements = (placementsByColumn.get(columnIndex) ?? []).toSorted(
      (left, right) => left.rowStart - right.rowStart,
    );
    let nextRow = 1;

    for (const placement of columnPlacements) {
      const rowSpan = Math.max(
        1,
        input.measuredRowSpanByPlacementKey.get(placement.placementKey) ?? placement.rowSpan,
      );
      const rowEnd = nextRow + rowSpan - 1;
      placements.push({
        ...placement,
        rowStart: nextRow,
        rowSpan,
      });
      maxRow = Math.max(maxRow, rowEnd);
      nextRow = rowEnd + PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP + 1;
    }
  }

  return { placements, maxRow };
}
