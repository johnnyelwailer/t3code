import {
  getProjectDashboardKanbanMatrixShellColumnRange,
  type ProjectDashboardKanbanMatrixShellPlacement,
} from "./t3team-projectDashboardKanbanMatrixShared";

export type ProjectDashboardKanbanMatrixShellSpanningRenderPlan = {
  columnIndex: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
};

export type ProjectDashboardKanbanMatrixShellRenderPlan =
  | {
      placementKey: string;
      ticketId: string;
      kind: "singleLane";
      columnIndex: number;
      rowStart: number;
      rowSpan: number;
      dividerRow: number;
    }
  | {
      placementKey: string;
      ticketId: string;
      kind: "spanning";
      columnIndex: number;
      columnSpan: number;
      rowStart: number;
      rowSpan: number;
    };

function getProjectDashboardKanbanMatrixShellRowEnd(
  shell: ProjectDashboardKanbanMatrixShellPlacement,
): number {
  return shell.segments.reduce(
    (currentMax, segment) => Math.max(currentMax, segment.rowStart + segment.rowSpan - 1),
    shell.headerRowStart + shell.headerRowSpan - 1,
  );
}

export function buildProjectDashboardKanbanMatrixShellRenderPlan(
  shells: readonly ProjectDashboardKanbanMatrixShellPlacement[],
): readonly ProjectDashboardKanbanMatrixShellRenderPlan[] {
  return [...shells]
    .toSorted((left, right) => {
      const leftColumnRange = getProjectDashboardKanbanMatrixShellColumnRange(left);
      const rightColumnRange = getProjectDashboardKanbanMatrixShellColumnRange(right);
      const leftColumnSpan = leftColumnRange.endColumnIndex - leftColumnRange.startColumnIndex + 1;
      const rightColumnSpan =
        rightColumnRange.endColumnIndex - rightColumnRange.startColumnIndex + 1;
      if (leftColumnSpan !== rightColumnSpan) {
        return rightColumnSpan - leftColumnSpan;
      }

      const leftRowSpan =
        getProjectDashboardKanbanMatrixShellRowEnd(left) - left.headerRowStart + 1;
      const rightRowSpan =
        getProjectDashboardKanbanMatrixShellRowEnd(right) - right.headerRowStart + 1;
      if (leftRowSpan !== rightRowSpan) {
        return rightRowSpan - leftRowSpan;
      }

      return left.ticket.id.localeCompare(right.ticket.id);
    })
    .map((shell) => {
      const columnRange = getProjectDashboardKanbanMatrixShellColumnRange(shell);
      const columnSpan = columnRange.endColumnIndex - columnRange.startColumnIndex + 1;
      const shellRowEnd = getProjectDashboardKanbanMatrixShellRowEnd(shell);
      if (columnSpan === 1) {
        return {
          placementKey: shell.placementKey,
          ticketId: shell.ticket.id,
          kind: "singleLane",
          columnIndex: columnRange.startColumnIndex,
          rowStart: shell.headerRowStart,
          rowSpan: shellRowEnd - shell.headerRowStart + 1,
          dividerRow: shell.headerRowStart + shell.headerRowSpan - 1,
        } satisfies ProjectDashboardKanbanMatrixShellRenderPlan;
      }

      return {
        placementKey: shell.placementKey,
        ticketId: shell.ticket.id,
        kind: "spanning",
        columnIndex: columnRange.startColumnIndex,
        columnSpan,
        rowStart: shell.headerRowStart,
        rowSpan: shellRowEnd - shell.headerRowStart + 1,
      } satisfies ProjectDashboardKanbanMatrixShellRenderPlan;
    });
}
