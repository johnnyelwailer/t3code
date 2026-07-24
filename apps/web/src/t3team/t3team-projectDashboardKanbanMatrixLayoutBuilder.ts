import type { TicketHierarchy } from "~/t3team/t3team-projectDashboardKanbanHierarchy";
import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  getProjectDashboardKanbanMatrixCardRows,
  mergeProjectDashboardKanbanMatrixColumnRowRange,
  PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP,
  type PlacementSummary,
  type ProjectDashboardKanbanMatrixCardPlacement,
  type ProjectDashboardKanbanMatrixLayout,
  type ProjectDashboardKanbanMatrixShellPlacement,
} from "./t3team-projectDashboardKanbanMatrixShared";

const PROJECT_DASHBOARD_KANBAN_MATRIX_SHELL_BOTTOM_PADDING_ROWS = 1,
  PROJECT_DASHBOARD_KANBAN_MATRIX_NESTED_ROW_GAP = 0;

function getProjectDashboardKanbanMatrixMaxRow(
  columnRanges: ReadonlyMap<number, { min: number; max: number }>,
  fallbackRowEnd: number,
): number {
  return Math.max(fallbackRowEnd, ...[...columnRanges.values()].map((range) => range.max));
}

function buildPlacementSummary(
  columnRanges: ReadonlyMap<number, { min: number; max: number }>,
  furthestColumnIndex: number,
  subtreePlacementKeys: ReadonlyArray<string>,
): PlacementSummary {
  return {
    minRowByColumn: new Map(
      [...columnRanges.entries()].map(([columnIndex, range]) => [columnIndex, range.min]),
    ),
    maxRowByColumn: new Map(
      [...columnRanges.entries()].map(([columnIndex, range]) => [columnIndex, range.max]),
    ),
    furthestColumnIndex,
    subtreePlacementKeys,
  };
}

export function buildProjectDashboardKanbanMatrixLayout(input: {
  kanbanColumns: ProjectTicketKanbanColumns;
  hierarchy: TicketHierarchy;
  rowSpanByPlacementKey?: ReadonlyMap<string, number>;
}): ProjectDashboardKanbanMatrixLayout {
  const columnByTicketId = new Map<
    string,
    { id: ProjectDashboardKanbanMatrixCardPlacement["columnId"]; index: number }
  >();
  const cards: ProjectDashboardKanbanMatrixCardPlacement[] = [];
  const shells: ProjectDashboardKanbanMatrixShellPlacement[] = [];
  const nextRowByColumn = new Map<number, number>();

  for (const [columnIndex, column] of input.kanbanColumns.entries()) {
    nextRowByColumn.set(columnIndex, 1);
    for (const ticket of column.items) {
      columnByTicketId.set(ticket.id, { id: column.id, index: columnIndex });
    }
  }

  const subtreeColumnRangeCache = new Map<string, { min: number; max: number } | null>();
  const getSubtreeColumnRange = (ticketId: string): { min: number; max: number } | null => {
    const cached = subtreeColumnRangeCache.get(ticketId);
    if (cached !== undefined) return cached;

    const ownColumnIndex = columnByTicketId.get(ticketId)?.index;
    let minColumnIndex = ownColumnIndex ?? Number.POSITIVE_INFINITY;
    let maxColumnIndex = ownColumnIndex ?? Number.NEGATIVE_INFINITY;
    let foundColumn = ownColumnIndex !== undefined;

    for (const child of input.hierarchy.childrenByParentId.get(ticketId) ?? []) {
      const childRange = getSubtreeColumnRange(child.id);
      if (!childRange) continue;
      foundColumn = true;
      minColumnIndex = Math.min(minColumnIndex, childRange.min);
      maxColumnIndex = Math.max(maxColumnIndex, childRange.max);
    }

    const range = foundColumn ? { min: minColumnIndex, max: maxColumnIndex } : null;
    subtreeColumnRangeCache.set(ticketId, range);
    return range;
  };

  const placeTicket = (ticket: ProjectTicket): PlacementSummary | null => {
    const subtreeColumnRange = getSubtreeColumnRange(ticket.id);
    if (!subtreeColumnRange) return null;

    const directColumn = columnByTicketId.get(ticket.id);
    const shellStartColumnIndex = subtreeColumnRange.min;
    const anchorColumnIndex = directColumn?.index ?? subtreeColumnRange.min;
    const anchorColumn = input.kanbanColumns[anchorColumnIndex];
    if (!anchorColumn) return null;

    const visibleChildren = input.hierarchy.childrenByParentId.get(ticket.id) ?? [];
    const furthestDescendantColumnIndex = subtreeColumnRange.max;
    const columnSpan = furthestDescendantColumnIndex - anchorColumnIndex + 1;
    const shellColumnSpan = furthestDescendantColumnIndex - shellStartColumnIndex + 1;
    const placementKey = `${anchorColumn.id}:${ticket.id}`;
    const rowSpan = Math.max(
      1,
      input.rowSpanByPlacementKey?.get(placementKey) ??
        getProjectDashboardKanbanMatrixCardRows(ticket, visibleChildren.length),
    );
    const rowStart = Array.from({ length: shellColumnSpan }, (_, offset) => {
      return nextRowByColumn.get(shellStartColumnIndex + offset) ?? 1;
    }).reduce((currentMax, nextRow) => Math.max(currentMax, nextRow), 1);
    const rowEnd = rowStart + rowSpan - 1;
    if (visibleChildren.length > 0) {
      for (
        let columnIndex = shellStartColumnIndex;
        columnIndex <= furthestDescendantColumnIndex;
        columnIndex += 1
      ) {
        nextRowByColumn.set(
          columnIndex,
          rowEnd + PROJECT_DASHBOARD_KANBAN_MATRIX_NESTED_ROW_GAP + 1,
        );
      }
    }

    const cardPlacement: ProjectDashboardKanbanMatrixCardPlacement = {
      placementKey,
      ticket,
      columnId: anchorColumn.id,
      columnIndex: anchorColumnIndex,
      columnSpan,
      rowStart,
      rowSpan,
      childCount: visibleChildren.length,
    };
    cards.push(cardPlacement);

    const columnRanges = new Map<number, { min: number; max: number }>();
    mergeProjectDashboardKanbanMatrixColumnRowRange(
      columnRanges,
      anchorColumnIndex,
      rowStart,
      rowEnd,
    );
    let furthestColumnIndex = furthestDescendantColumnIndex;
    const subtreePlacementKeys = [placementKey];

    for (const child of visibleChildren) {
      const childSummary = placeTicket(child);
      if (!childSummary) continue;
      furthestColumnIndex = Math.max(furthestColumnIndex, childSummary.furthestColumnIndex);
      subtreePlacementKeys.push(...childSummary.subtreePlacementKeys);
      for (const [columnIndex, minRow] of childSummary.minRowByColumn.entries()) {
        const maxRow = childSummary.maxRowByColumn.get(columnIndex);
        if (maxRow !== undefined) {
          mergeProjectDashboardKanbanMatrixColumnRowRange(
            columnRanges,
            columnIndex,
            minRow,
            maxRow,
          );
        }
      }
    }

    if (visibleChildren.length > 0) {
      const shellRowEnd =
        getProjectDashboardKanbanMatrixMaxRow(columnRanges, rowEnd) +
        PROJECT_DASHBOARD_KANBAN_MATRIX_SHELL_BOTTOM_PADDING_ROWS;
      for (
        let columnIndex = shellStartColumnIndex;
        columnIndex <= furthestColumnIndex;
        columnIndex += 1
      ) {
        nextRowByColumn.set(columnIndex, shellRowEnd + PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP + 1);
      }

      cardPlacement.columnSpan = furthestColumnIndex - anchorColumnIndex + 1;
      shells.push({
        ticket,
        placementKey,
        anchorColumnId: anchorColumn.id,
        anchorColumnIndex,
        endColumnIndex: furthestColumnIndex,
        headerRowStart: rowStart,
        headerRowSpan: rowSpan,
        subtreePlacementKeys,
        segments: [...columnRanges.entries()]
          .toSorted(([leftColumnIndex], [rightColumnIndex]) => leftColumnIndex - rightColumnIndex)
          .map(([columnIndex, range]) => {
            const column = input.kanbanColumns[columnIndex];
            return column
              ? {
                  columnId: column.id,
                  columnIndex,
                  rowStart: range.min,
                  rowSpan: shellRowEnd - range.min + 1,
                }
              : null;
          })
          .filter((segment) => segment !== null),
      });

      return buildPlacementSummary(columnRanges, furthestColumnIndex, subtreePlacementKeys);
    }

    nextRowByColumn.set(anchorColumnIndex, rowEnd + PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP + 1);

    return buildPlacementSummary(columnRanges, furthestColumnIndex, subtreePlacementKeys);
  };

  const seenTopLevelTicketIds = new Set<string>();
  const topLevelTickets = [...input.hierarchy.roots, ...input.hierarchy.unresolvedChildren].filter(
    (ticket) => {
      if (seenTopLevelTicketIds.has(ticket.id)) return false;
      seenTopLevelTicketIds.add(ticket.id);
      return true;
    },
  );

  for (const ticket of topLevelTickets) placeTicket(ticket);

  const maxRow = cards.reduce((currentMax, placement) => {
    return Math.max(currentMax, placement.rowStart + placement.rowSpan - 1);
  }, 0);

  return { cards, shells, maxRow };
}
