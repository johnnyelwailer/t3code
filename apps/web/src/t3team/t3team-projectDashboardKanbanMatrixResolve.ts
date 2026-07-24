import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";
import { buildProjectDashboardKanbanMatrixLayout } from "./t3team-projectDashboardKanbanMatrixLayoutBuilder";
import type {
  ProjectDashboardKanbanMatrixCardPlacement,
  ProjectDashboardKanbanMatrixLayout,
} from "./t3team-projectDashboardKanbanMatrixShared";

function buildProjectDashboardKanbanMatrixColumnsFromLayout(
  cards: readonly ProjectDashboardKanbanMatrixCardPlacement[],
): ProjectTicketKanbanColumns {
  const maxColumnIndex = cards.reduce((currentMax, card) => {
    return Math.max(currentMax, card.columnIndex + card.columnSpan - 1);
  }, -1);
  if (maxColumnIndex < 0) {
    return [];
  }

  const directColumnIdByIndex = new Map<
    number,
    ProjectDashboardKanbanMatrixCardPlacement["columnId"]
  >();
  for (const card of cards) {
    if (!directColumnIdByIndex.has(card.columnIndex)) {
      directColumnIdByIndex.set(card.columnIndex, card.columnId);
    }
  }

  return Array.from({ length: maxColumnIndex + 1 }, (_, columnIndex) => {
    const columnId = directColumnIdByIndex.get(columnIndex) ?? `__matrix_column_${columnIndex}__`;
    return {
      id: columnId,
      title: columnId,
      items: cards.filter((card) => card.columnIndex === columnIndex).map((card) => card.ticket),
    };
  });
}

export function resolveProjectDashboardKanbanMatrixLayout(input: {
  layout: ProjectDashboardKanbanMatrixLayout;
  measuredRowSpanByPlacementKey: ReadonlyMap<string, number>;
}): ProjectDashboardKanbanMatrixLayout {
  const orderedCards = [...input.layout.cards].toSorted((left, right) => {
    if (left.rowStart !== right.rowStart) return left.rowStart - right.rowStart;
    if (left.columnIndex !== right.columnIndex) return left.columnIndex - right.columnIndex;
    return left.ticket.id.localeCompare(right.ticket.id);
  });
  const rowSpanByPlacementKey = new Map(
    orderedCards.map((card) => [card.placementKey, card.rowSpan] as const),
  );

  for (const [placementKey, rowSpan] of input.measuredRowSpanByPlacementKey.entries()) {
    rowSpanByPlacementKey.set(placementKey, Math.max(1, rowSpan));
  }

  return buildProjectDashboardKanbanMatrixLayout({
    kanbanColumns: buildProjectDashboardKanbanMatrixColumnsFromLayout(orderedCards),
    hierarchy: buildProjectTicketHierarchy(orderedCards.map((card) => card.ticket)),
    rowSpanByPlacementKey,
  });
}
