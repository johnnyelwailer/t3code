import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";

/**
 * Board columns the user folded away. `onToggle(columnId, collapsed)` is the one writer; the
 * state itself lives in the project's persisted My Work state, so a board that is rendered without
 * it (the all-projects roll-up, stories) simply offers no collapse control.
 */
export interface ProjectDashboardKanbanColumnCollapse {
  readonly collapsedIds: ReadonlySet<string>;
  readonly onToggle: (columnId: string, collapsed: boolean) => void;
}

const OPEN_COLUMN_WIDTH = "minmax(17rem, 1fr)";
const COLLAPSED_COLUMN_WIDTH = "2.75rem";

/** One track per column: open columns share the width, a collapsed one is a narrow strip. */
export function buildKanbanGridTemplateColumns(
  columns: ProjectTicketKanbanColumns,
  collapsedIds: ReadonlySet<string> | undefined,
): string {
  return columns
    .map((column) => (collapsedIds?.has(column.id) ? COLLAPSED_COLUMN_WIDTH : OPEN_COLUMN_WIDTH))
    .join(" ");
}

/**
 * The columns a layout should place cards in. A collapsed column keeps its slot (so its strip and
 * its drop target stay) but contributes no cards, exactly like a hidden lane does for the matrix.
 */
export function withoutCollapsedColumnItems(
  columns: ProjectTicketKanbanColumns,
  collapsedIds: ReadonlySet<string> | undefined,
): ProjectTicketKanbanColumns {
  if (!collapsedIds || collapsedIds.size === 0) return columns;
  return columns.map((column) =>
    collapsedIds.has(column.id) && column.items.length > 0 ? { ...column, items: [] } : column,
  );
}
