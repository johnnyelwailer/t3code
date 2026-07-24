import { getProjectTicketIssueTypeKey } from "~/t3team/t3team-projectBacklogUtils";
import type { ProjectTicketKanbanColumnId } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

export const PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP = 1;
export const PROJECT_DASHBOARD_KANBAN_MATRIX_MIN_CARD_ROWS = 8;

export type ProjectDashboardKanbanMatrixCardPlacement = {
  placementKey: string;
  ticket: ProjectTicket;
  columnId: ProjectTicketKanbanColumnId;
  columnIndex: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
  childCount: number;
};

export type ProjectDashboardKanbanMatrixShellSegment = {
  columnId: ProjectTicketKanbanColumnId;
  columnIndex: number;
  rowStart: number;
  rowSpan: number;
};

export type ProjectDashboardKanbanMatrixShellPlacement = {
  ticket: ProjectTicket;
  placementKey: string;
  anchorColumnId: ProjectTicketKanbanColumnId;
  anchorColumnIndex: number;
  endColumnIndex: number;
  headerRowStart: number;
  headerRowSpan: number;
  segments: readonly ProjectDashboardKanbanMatrixShellSegment[];
  subtreePlacementKeys: readonly string[];
};

export type ProjectDashboardKanbanMatrixLayout = {
  cards: readonly ProjectDashboardKanbanMatrixCardPlacement[];
  shells: readonly ProjectDashboardKanbanMatrixShellPlacement[];
  maxRow: number;
};

export type PlacementSummary = {
  minRowByColumn: ReadonlyMap<number, number>;
  maxRowByColumn: ReadonlyMap<number, number>;
  furthestColumnIndex: number;
  subtreePlacementKeys: readonly string[];
};

export function getProjectDashboardKanbanMatrixShellColumnRange(
  shell: ProjectDashboardKanbanMatrixShellPlacement,
): { startColumnIndex: number; endColumnIndex: number } {
  return shell.segments.reduce(
    (range, segment) => ({
      startColumnIndex: Math.min(range.startColumnIndex, segment.columnIndex),
      endColumnIndex: Math.max(range.endColumnIndex, segment.columnIndex),
    }),
    {
      startColumnIndex: shell.anchorColumnIndex,
      endColumnIndex: shell.endColumnIndex,
    },
  );
}

export function getProjectDashboardKanbanMatrixRowSpanForHeight(input: {
  heightPx: number;
  rowHeightPx: number;
  rowGapPx: number;
}): number {
  const { heightPx, rowHeightPx, rowGapPx } = input;
  if (!Number.isFinite(heightPx) || heightPx <= 0) return 1;
  return Math.max(1, Math.ceil((heightPx + rowGapPx) / (rowHeightPx + rowGapPx)));
}

export function getProjectDashboardKanbanMatrixCardRows(
  ticket: ProjectTicket,
  childCount: number,
): number {
  let rows = PROJECT_DASHBOARD_KANBAN_MATRIX_MIN_CARD_ROWS;
  const issueType = getProjectTicketIssueTypeKey(ticket);
  const titleLength = ticket.ref.title.trim().length;

  if (issueType.includes("epic")) rows += 3;
  else if (issueType.includes("story")) rows += 1;
  if (ticket.assignee?.trim()) rows += 2;
  if (titleLength > 56) rows += 2;
  if (titleLength > 112) rows += 2;
  if (childCount > 0) rows += 1;

  return rows;
}

export function mergeProjectDashboardKanbanMatrixColumnRowRange(
  target: Map<number, { min: number; max: number }>,
  columnIndex: number,
  rowStart: number,
  rowEnd: number,
) {
  const current = target.get(columnIndex);
  if (!current) {
    target.set(columnIndex, { min: rowStart, max: rowEnd });
    return;
  }

  target.set(columnIndex, {
    min: Math.min(current.min, rowStart),
    max: Math.max(current.max, rowEnd),
  });
}
