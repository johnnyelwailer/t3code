import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3work-projectBacklogTestUtils";
import {
  buildProjectTicketKanbanColumns,
  getProjectTicketKanbanColumnId,
  getProjectTicketKanbanLane,
  isProjectTicketKanbanStatusVisibleForProfile,
  matchesProjectTicketStatusCategory,
} from "./t3work-projectTicketStatus";

describe("project ticket status", () => {
  it("maps custom Jira workflow names into canonical kanban lanes", () => {
    expect(getProjectTicketKanbanLane("Selected for Development")).toBe("todo");
    expect(getProjectTicketKanbanLane("Accepted")).toBe("inProgress");
    expect(getProjectTicketKanbanLane("Blocked")).toBe("inProgress");
    expect(getProjectTicketKanbanLane("In Test")).toBe("review");
    expect(getProjectTicketKanbanLane("Ready for Review")).toBe("review");
    expect(getProjectTicketKanbanLane("Cancelled")).toBe("done");
  });

  it("treats todo and in-progress lanes as active work", () => {
    expect(matchesProjectTicketStatusCategory("Selected for Development", "active")).toBe(true);
    expect(matchesProjectTicketStatusCategory("Blocked", "active")).toBe(true);
    expect(matchesProjectTicketStatusCategory("In QA", "review")).toBe(true);
    expect(matchesProjectTicketStatusCategory("Resolved", "done")).toBe(true);
  });

  it("builds exact Jira status columns without a fallback other bucket", () => {
    const columns = buildProjectTicketKanbanColumns([
      createTicket({ id: "todo-a", status: "To Do" }),
      createTicket({ id: "todo-b", status: "To Do" }),
      createTicket({ id: "accepted", status: "Accepted" }),
      createTicket({ id: "in-test", status: "In Test" }),
      createTicket({ id: "done", status: "Cancelled" }),
    ]);

    expect(columns.map((column) => column.title)).toEqual([
      "To Do",
      "Accepted",
      "In Test",
      "Cancelled",
    ]);
    expect(columns.map((column) => column.id)).toEqual([
      getProjectTicketKanbanColumnId("To Do"),
      getProjectTicketKanbanColumnId("Accepted"),
      getProjectTicketKanbanColumnId("In Test"),
      getProjectTicketKanbanColumnId("Cancelled"),
    ]);
    expect(columns[0]?.items.map((ticket) => ticket.id)).toEqual(["todo-a", "todo-b"]);
  });

  it("uses official Jira board order and hides statuses outside the board", () => {
    const columns = buildProjectTicketKanbanColumns(
      [
        createTicket({ id: "todo", status: "To Do" }),
        createTicket({ id: "accepted", status: "Accepted" }),
        createTicket({ id: "in-test", status: "In Test" }),
        createTicket({ id: "cancelled", status: "Cancelled" }),
      ],
      {
        boardColumns: [
          { name: "To Do", statuses: [{ name: "To Do" }] },
          { name: "Testing", statuses: [{ name: "In Test" }] },
          { name: "Done", statuses: [{ name: "Cancelled" }] },
        ],
      },
    );

    expect(columns.map((column) => column.title)).toEqual(["To Do", "In Test", "Cancelled"]);
  });

  it("keeps configured Jira board statuses visible even when they are currently empty", () => {
    const columns = buildProjectTicketKanbanColumns(
      [createTicket({ id: "todo", status: "To Do" })],
      {
        boardColumns: [
          { name: "To Do", statuses: [{ name: "To Do" }] },
          { name: "Review", statuses: [{ name: "Code Review" }] },
          { name: "Done", statuses: [{ name: "Done" }] },
        ],
      },
    );

    expect(columns.map((column) => ({ title: column.title, count: column.items.length }))).toEqual([
      { title: "To Do", count: 1 },
      { title: "Code Review", count: 0 },
      { title: "Done", count: 0 },
    ]);
  });

  it("seeds Jira project statuses even when board columns are unavailable", () => {
    const columns = buildProjectTicketKanbanColumns(
      [createTicket({ id: "todo", status: "To Do" })],
      {
        availableStatuses: [{ name: "Code Review" }, { name: "Done" }, { name: "To Do" }],
      },
    );

    expect(columns.map((column) => ({ title: column.title, count: column.items.length }))).toEqual([
      { title: "To Do", count: 1 },
      { title: "Code Review", count: 0 },
      { title: "Done", count: 0 },
    ]);
  });

  it("shows occupied statuses before empty seeded Jira statuses when board order is unavailable", () => {
    const columns = buildProjectTicketKanbanColumns(
      [
        createTicket({ id: "todo", status: "To Do" }),
        createTicket({ id: "progress", status: "In Progress" }),
        createTicket({ id: "review", status: "Code Review" }),
      ],
      {
        availableStatuses: [
          { name: "Active" },
          { name: "Approved" },
          { name: "Code Review" },
          { name: "Done" },
          { name: "In Progress" },
          { name: "To Do" },
        ],
      },
    );

    expect(columns.map((column) => ({ title: column.title, count: column.items.length }))).toEqual([
      { title: "To Do", count: 1 },
      { title: "In Progress", count: 1 },
      { title: "Code Review", count: 1 },
      { title: "Active", count: 0 },
      { title: "Approved", count: 0 },
      { title: "Done", count: 0 },
    ]);
  });

  it("hides requirements-only statuses for non-RE kanban profiles", () => {
    expect(isProjectTicketKanbanStatusVisibleForProfile("Accepted", "product-owner")).toBe(true);
    expect(isProjectTicketKanbanStatusVisibleForProfile("Accepted", "developer")).toBe(
      false,
    );
    expect(isProjectTicketKanbanStatusVisibleForProfile("Accepted", "test-manager")).toBe(false);
    expect(isProjectTicketKanbanStatusVisibleForProfile("In Test", "developer")).toBe(
      true,
    );

    const engineeringColumns = buildProjectTicketKanbanColumns(
      [
        createTicket({ id: "todo", status: "To Do" }),
        createTicket({ id: "accepted", status: "Accepted" }),
        createTicket({ id: "in-test", status: "In Test" }),
      ],
      { profileId: "developer" },
    );
    const productColumns = buildProjectTicketKanbanColumns(
      [
        createTicket({ id: "todo", status: "To Do" }),
        createTicket({ id: "accepted", status: "Accepted" }),
        createTicket({ id: "in-test", status: "In Test" }),
      ],
      { profileId: "product-owner" },
    );

    expect(engineeringColumns.map((column) => column.title)).toEqual(["To Do", "In Test"]);
    expect(productColumns.map((column) => column.title)).toEqual(["To Do", "Accepted", "In Test"]);
  });
});
