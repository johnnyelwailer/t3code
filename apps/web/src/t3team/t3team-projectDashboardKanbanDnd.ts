import type { ProjectTicket } from "~/t3team/t3team-types";
import type {
  ProjectTicketKanbanColumnId,
  ProjectTicketKanbanColumns,
} from "~/t3team/t3team-projectTicketStatus";

export type ProjectDashboardKanbanOptimisticMove = {
  columnId: ProjectTicketKanbanColumnId;
  status: string;
  pending: boolean;
};

export function buildProjectDashboardKanbanColumnByTicketId(
  columns: ProjectTicketKanbanColumns,
): ReadonlyMap<string, ProjectTicketKanbanColumnId> {
  const columnsByTicketId = new Map<string, ProjectTicketKanbanColumnId>();

  for (const column of columns) {
    for (const ticket of column.items) columnsByTicketId.set(ticket.id, column.id);
  }

  return columnsByTicketId;
}

export function applyProjectDashboardKanbanOptimisticMoves(
  columns: ProjectTicketKanbanColumns,
  moves: Readonly<Record<string, ProjectDashboardKanbanOptimisticMove>>,
): ProjectTicketKanbanColumns {
  const nextColumns = columns.map((column) => ({
    id: column.id,
    title: column.title,
    items: [] as ProjectTicket[],
  }));
  const columnById = new Map(nextColumns.map((column) => [column.id, column]));

  for (const column of columns) {
    for (const ticket of column.items) {
      const move = moves[ticket.id];
      const targetColumn = columnById.get(move?.columnId ?? column.id) ?? columnById.get(column.id);
      targetColumn?.items.push(move ? { ...ticket, status: move.status } : ticket);
    }
  }

  return nextColumns;
}
