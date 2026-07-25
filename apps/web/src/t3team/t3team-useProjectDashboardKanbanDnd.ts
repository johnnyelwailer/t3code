import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";

import { toastManager } from "~/components/ui/toast";
import {
  readKanbanColumnId,
  readKanbanTicketId,
} from "~/t3team/t3team-ProjectDashboardKanbanDndUi";
import {
  applyProjectDashboardKanbanOptimisticMoves,
  buildProjectDashboardKanbanColumnByTicketId,
  type ProjectDashboardKanbanOptimisticMove,
} from "~/t3team/t3team-projectDashboardKanbanDnd";
import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

import {
  buildProjectDashboardKanbanMoveError,
  type ProjectDashboardKanbanMoveError,
} from "./t3team-projectDashboardKanbanMoveError";

export function useProjectDashboardKanbanDnd({
  kanbanColumns,
  onMoveTicketToStatus,
}: {
  kanbanColumns: ProjectTicketKanbanColumns;
  onMoveTicketToStatus:
    | ((ticket: ProjectTicket, targetStatus: string) => Promise<string>)
    | undefined;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<ProjectDashboardKanbanMoveError | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    Readonly<Record<string, ProjectDashboardKanbanOptimisticMove>>
  >({});
  const baseLaneByTicketId = useMemo(
    () => buildProjectDashboardKanbanColumnByTicketId(kanbanColumns),
    [kanbanColumns],
  );
  const displayColumns = useMemo(
    () => applyProjectDashboardKanbanOptimisticMoves(kanbanColumns, optimisticMoves),
    [kanbanColumns, optimisticMoves],
  );
  const displayLaneByTicketId = useMemo(
    () => buildProjectDashboardKanbanColumnByTicketId(displayColumns),
    [displayColumns],
  );
  const ticketById = useMemo(() => {
    const next = new Map<string, ProjectTicket>();
    for (const column of kanbanColumns) {
      for (const ticket of column.items) {
        next.set(ticket.id, ticket);
      }
    }
    return next;
  }, [kanbanColumns]);

  useEffect(() => {
    setOptimisticMoves((current) => {
      let changed = false;
      const next = { ...current };

      for (const [ticketId, move] of Object.entries(current)) {
        if (
          !move.pending &&
          (!baseLaneByTicketId.has(ticketId) || baseLaneByTicketId.get(ticketId) === move.columnId)
        ) {
          delete next[ticketId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [baseLaneByTicketId]);

  const clearDrag = () => setActiveTicketId(null);

  const handleDragStart = (event: DragStartEvent) => {
    setMoveError(null);
    setActiveTicketId(readKanbanTicketId(String(event.active.id)) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const ticketId = readKanbanTicketId(String(event.active.id));
    const targetColumnId = readKanbanColumnId(event.over ? String(event.over.id) : undefined);
    clearDrag();
    if (!ticketId || !targetColumnId || !onMoveTicketToStatus) {
      return;
    }

    const ticket = ticketById.get(ticketId);
    const currentColumnId = displayLaneByTicketId.get(ticketId);
    const targetColumn = displayColumns.find((column) => column.id === targetColumnId);
    if (!ticket || !currentColumnId || !targetColumn || currentColumnId === targetColumnId) {
      return;
    }

    setOptimisticMoves((current) => ({
      ...current,
      [ticketId]: {
        columnId: targetColumnId,
        pending: true,
        status: targetColumn.title,
      },
    }));

    void onMoveTicketToStatus(ticket, targetColumn.title)
      .then((status) => {
        setOptimisticMoves((current) => ({
          ...current,
          [ticketId]: { columnId: targetColumnId, pending: false, status },
        }));
      })
      .catch((error) => {
        setOptimisticMoves((current) => {
          const next = { ...current };
          delete next[ticketId];
          return next;
        });

        const nextMoveError = buildProjectDashboardKanbanMoveError({
          ticket,
          targetStatus: targetColumn.title,
          error,
        });
        setMoveError(nextMoveError);
        toastManager.add({
          type: "error",
          title: nextMoveError.title,
          description: nextMoveError.description,
        });
      });
  };

  return {
    sensors,
    activeTicketId,
    moveError,
    optimisticMoves,
    displayColumns,
    clearDrag,
    handleDragStart,
    handleDragEnd,
  };
}
