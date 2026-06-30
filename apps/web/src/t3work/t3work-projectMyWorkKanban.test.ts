import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3work-projectBacklogTestUtils";
import {
  filterProjectMyWorkKanbanColumnsByHiddenColumns,
  buildProjectMyWorkFlatKanbanColumns,
  buildProjectMyWorkKanbanLaneOptions,
  buildProjectMyWorkTypeOptions,
  buildProjectMyWorkVisibleHierarchy,
  compareProjectMyWorkTickets,
  filterProjectMyWorkKanbanTicketsByHiddenColumns,
  isProjectMyWorkEpic,
  sortProjectMyWorkTickets,
} from "./t3work-projectMyWork";
import {
  buildProjectTicketKanbanColumns,
  getProjectTicketKanbanColumnId,
} from "./t3work-projectTicketStatus";

describe("project my work kanban", () => {
  it("can hide specific kanban lanes while keeping descendants on visible lanes", () => {
    const acceptedParent = createTicket({
      id: "parent",
      issueType: "Story",
      status: "Accepted",
      ref: { displayId: "PROJ-1", title: "Parent" },
      assignee: "Philip Jonientz",
    });
    const inProgressChild = createTicket({
      id: "child",
      issueType: "Task",
      status: "In Progress",
      parentId: acceptedParent.id,
      ref: { displayId: "PROJ-2", title: "Child" },
      assignee: "Philip Jonientz",
    });

    const visibleTickets = filterProjectMyWorkKanbanTicketsByHiddenColumns(
      [acceptedParent, inProgressChild],
      [getProjectTicketKanbanColumnId("Accepted")],
    );
    const hierarchy = buildProjectMyWorkVisibleHierarchy(
      [acceptedParent, inProgressChild],
      visibleTickets,
      {
        sortBy: "updated",
        sortDirection: "desc",
        excludedVisibleTypeKeys: [],
      },
    );
    const columns = buildProjectTicketKanbanColumns(visibleTickets);

    expect(columns.map((column) => column.title)).toEqual(["In Progress"]);
    expect(hierarchy.visibleTickets.map((ticket) => ticket.id)).toEqual(["parent", "child"]);
    expect(hierarchy.matchedTicketIds.has("parent")).toBe(false);
    expect(hierarchy.matchedTicketIds.has("child")).toBe(true);
    expect(buildProjectMyWorkKanbanLaneOptions(columns)).toEqual([
      { id: getProjectTicketKanbanColumnId("In Progress"), title: "In Progress", count: 1 },
    ]);
  });

  it("rehomes hidden-lane parents into a visible child lane for flat kanban", () => {
    const acceptedParent = createTicket({
      id: "parent",
      issueType: "Story",
      status: "Accepted",
      ref: { displayId: "PROJ-1", title: "Parent" },
      assignee: "Philip Jonientz",
    });
    const inProgressChild = createTicket({
      id: "child",
      issueType: "Task",
      status: "In Progress",
      parentId: acceptedParent.id,
      ref: { displayId: "PROJ-2", title: "Child" },
      assignee: "Philip Jonientz",
    });

    const matchedTickets = filterProjectMyWorkKanbanTicketsByHiddenColumns(
      [acceptedParent, inProgressChild],
      [getProjectTicketKanbanColumnId("Accepted")],
    );
    const visibleHierarchy = buildProjectMyWorkVisibleHierarchy(
      [acceptedParent, inProgressChild],
      matchedTickets,
      {
        sortBy: "updated",
        sortDirection: "desc",
        excludedVisibleTypeKeys: [],
      },
    );
    const columns = buildProjectMyWorkFlatKanbanColumns({
      columns: buildProjectTicketKanbanColumns(matchedTickets),
      visibleHierarchy,
      hiddenKanbanColumnIds: [getProjectTicketKanbanColumnId("Accepted")],
    });

    expect(columns).toHaveLength(1);
    expect(columns[0]?.title).toBe("In Progress");
    expect(columns[0]?.items.map((ticket) => ticket.id)).toEqual(["parent", "child"]);
  });

  it("builds stable issue type options and recognizes epics", () => {
    const options = buildProjectMyWorkTypeOptions([
      createTicket({ id: "epic", issueType: "Epic" }),
      createTicket({ id: "story-a", issueType: "Story" }),
      createTicket({ id: "story-b", issueType: "Story" }),
    ]);

    expect(options).toEqual([
      { key: "epic", label: "Epic" },
      { key: "story", label: "Story" },
    ]);
    expect(isProjectMyWorkEpic(createTicket({ id: "epic", issueType: "Epic" }))).toBe(true);
  });

  it("keeps empty configured lanes available in my work lane options", () => {
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

    expect(buildProjectMyWorkKanbanLaneOptions(columns)).toEqual([
      { id: getProjectTicketKanbanColumnId("To Do"), title: "To Do", count: 1 },
      { id: getProjectTicketKanbanColumnId("Code Review"), title: "Code Review", count: 0 },
      { id: getProjectTicketKanbanColumnId("Done"), title: "Done", count: 0 },
    ]);
  });

  it("removes hidden lanes from rendered kanban columns", () => {
    const columns = buildProjectTicketKanbanColumns(
      [createTicket({ id: "todo", status: "To Do" })],
      {
        availableStatuses: [{ name: "To Do" }, { name: "Code Review" }, { name: "Done" }],
      },
    );

    expect(
      filterProjectMyWorkKanbanColumnsByHiddenColumns(columns, [
        getProjectTicketKanbanColumnId("Code Review"),
        getProjectTicketKanbanColumnId("Done"),
      ]).map((column) => column.title),
    ).toEqual(["To Do"]);
  });

  it("sorts my-work tickets by last updated descending by default", () => {
    const older = createTicket({
      id: "older",
      updatedAt: "2026-05-20T09:00:00.000Z",
      ref: { displayId: "PROJ-2", title: "Older" },
      assignee: "Philip Jonientz",
    });
    const newer = createTicket({
      id: "newer",
      updatedAt: "2026-05-21T09:00:00.000Z",
      ref: { displayId: "PROJ-1", title: "Newer" },
      assignee: "Philip Jonientz",
    });

    expect(
      sortProjectMyWorkTickets({
        tickets: [older, newer],
        sortBy: "updated",
        sortDirection: "desc",
      }).map((ticket) => ticket.id),
    ).toEqual(["newer", "older"]);
    expect(compareProjectMyWorkTickets(newer, older, "updated", "desc")).toBeLessThan(0);
  });
});
