import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import {
  applyProjectDashboardKanbanOptimisticMoves,
  buildProjectDashboardKanbanColumnByTicketId,
} from "./t3team-projectDashboardKanbanDnd";
import {
  buildProjectTicketKanbanColumns,
  getProjectTicketKanbanColumnId,
} from "./t3team-projectTicketStatus";

describe("project dashboard kanban dnd", () => {
  it("moves optimistic tickets into the target lane without duplicating them", () => {
    const columns = buildProjectTicketKanbanColumns([
      createTicket({ id: "todo", status: "To Do" }),
      createTicket({ id: "active", status: "In Progress" }),
    ]);

    const nextColumns = applyProjectDashboardKanbanOptimisticMoves(columns, {
      todo: {
        columnId: getProjectTicketKanbanColumnId("In Progress"),
        pending: true,
        status: "In Progress",
      },
    });

    expect(
      nextColumns.find((column) => column.id === getProjectTicketKanbanColumnId("To Do"))?.items,
    ).toEqual([]);
    expect(
      nextColumns
        .find((column) => column.id === getProjectTicketKanbanColumnId("In Progress"))
        ?.items.map((ticket) => ticket.id),
    ).toEqual(["todo", "active"]);
    expect(
      nextColumns.find((column) => column.id === getProjectTicketKanbanColumnId("In Progress"))
        ?.items[0]?.status,
    ).toBe("In Progress");
  });

  it("builds status-column lookup maps from rendered kanban columns", () => {
    const columnsByTicketId = buildProjectDashboardKanbanColumnByTicketId(
      buildProjectTicketKanbanColumns([
        createTicket({ id: "review", status: "Ready for Review" }),
        createTicket({ id: "done", status: "Resolved" }),
      ]),
    );

    expect(columnsByTicketId.get("review")).toBe(
      getProjectTicketKanbanColumnId("Ready for Review"),
    );
    expect(columnsByTicketId.get("done")).toBe(getProjectTicketKanbanColumnId("Resolved"));
  });

  it("keeps a ticket visible when an optimistic target lane is not currently rendered", () => {
    const todoTicket = createTicket({ id: "todo", status: "To Do" });
    const visibleColumns = buildProjectTicketKanbanColumns([todoTicket]).filter(
      (column) => column.id !== getProjectTicketKanbanColumnId("In Progress"),
    );

    const nextColumns = applyProjectDashboardKanbanOptimisticMoves(visibleColumns, {
      todo: {
        columnId: getProjectTicketKanbanColumnId("In Progress"),
        pending: true,
        status: "In Progress",
      },
    });

    expect(nextColumns.flatMap((column) => column.items.map((ticket) => ticket.id))).toEqual([
      "todo",
    ]);
    expect(nextColumns[0]?.items[0]?.status).toBe("In Progress");
  });
});
