import { describe, expect, it } from "vite-plus/test";

import { buildVisibleBacklogHierarchy } from "./t3team-projectBacklogPresentation";
import {
  areProjectBacklogTableGroupsEqual,
  areProjectBacklogTableRowsEqual,
  buildProjectBacklogTableGroups,
  filterVisibleProjectBacklogTableRows,
  getProjectBacklogTableExpandableTicketIds,
} from "./t3team-projectBacklogTable";
import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";

describe("project backlog table presentation", () => {
  it("groups table rows by sprint with active work first and unsprinted work last", () => {
    const tickets = [
      createTicket({
        id: "active",
        sprintId: "4488",
        sprintName: "Sprint 6",
        sprintState: "active",
        sprintStartDate: "2026-05-20T10:05:36.454Z",
      }),
      createTicket({
        id: "future",
        sprintId: "4489",
        sprintName: "Sprint 7",
        sprintState: "future",
        sprintStartDate: "2026-06-08T22:00:00.000Z",
      }),
      createTicket({ id: "unsprinted" }),
    ];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);

    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "sprint",
      sortBy: "rank",
      sortDirection: "desc",
    });

    expect(groups.map((group) => group.label)).toEqual(["Sprint 6", "Sprint 7", "No sprint"]);
  });

  it("keeps every filtered ticket in exactly one matched table group", () => {
    const parent = createTicket({
      id: "parent",
      assignee: "Alex",
      estimateValue: 8,
      issueType: "Story",
      ref: { displayId: "PROJ-1" },
      sprintId: "4488",
      sprintName: "Sprint 6",
      sprintState: "active",
      sprintStartDate: "2026-05-20T10:05:36.454Z",
      status: "In Progress",
    });
    const child = createTicket({
      id: "child",
      assignee: "Alex",
      issueType: "Sub-task",
      parentId: parent.id,
      ref: { displayId: "PROJ-2" },
      status: "Backlog",
    });
    const needsOwner = createTicket({
      id: "needs-owner",
      estimateValue: 3,
      issueType: "Bug",
      ref: { displayId: "PROJ-3" },
      status: "Selected for Development",
    });
    const unsprinted = createTicket({
      id: "unsprinted",
      assignee: "Blair",
      estimateValue: 5,
      issueType: "Task",
      ref: { displayId: "PROJ-4" },
      status: "Done",
    });
    const tickets = [parent, child, needsOwner, unsprinted];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);
    const groupModes = [
      "none",
      "planning-state",
      "sprint",
      "assignee",
      "status",
      "issue-type",
      "parent",
    ] as const;

    for (const groupBy of groupModes) {
      const groups = buildProjectBacklogTableGroups({
        tickets,
        contextByTicketId: presentation.contextByTicketId,
        groupBy,
        sortBy: "rank",
        sortDirection: "desc",
      });

      const matchedRowIds = groups.flatMap((group) =>
        group.rows.filter((row) => !row.isContextOnly).map((row) => row.ticket.id),
      );

      expect(groups.reduce((sum, group) => sum + group.matchedCount, 0)).toBe(tickets.length);
      expect(matchedRowIds).toHaveLength(tickets.length);
      expect(new Set(matchedRowIds)).toEqual(new Set(tickets.map((ticket) => ticket.id)));
    }
  });

  it("marks parent rows as expandable and hides descendants when collapsed", () => {
    const parent = createTicket({ id: "parent", ref: { displayId: "PROJ-1" } });
    const child = createTicket({
      id: "child",
      parentId: parent.id,
      ref: { displayId: "PROJ-2" },
    });
    const grandchild = createTicket({
      id: "grandchild",
      parentId: child.id,
      issueType: "Sub-task",
      ref: { displayId: "PROJ-3" },
    });
    const tickets = [parent, child, grandchild];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);

    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "status",
      sortBy: "rank",
      sortDirection: "desc",
    });

    expect(getProjectBacklogTableExpandableTicketIds(groups[0]!.rows)).toEqual(
      new Set([parent.id, child.id]),
    );
    expect(
      filterVisibleProjectBacklogTableRows({
        rows: groups[0]!.rows,
        contextByTicketId: presentation.contextByTicketId,
        collapsedTicketIds: new Set([parent.id]),
      }).map((row) => row.ticket.id),
    ).toEqual([parent.id]);
  });

  it("keeps descendants under their direct visible parent inside grouped rows", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      ref: { displayId: "PROJ-1", title: "Checkout" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      ref: { displayId: "PROJ-2", title: "Cart" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      ref: { displayId: "PROJ-3", title: "Button" },
    });
    const tickets = [epic, story, subtask];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);

    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "issue-type",
      sortBy: "key",
      sortDirection: "desc",
    });
    const subtaskGroup = groups.find((group) => group.label === "Sub-task");

    expect(subtaskGroup?.rows.map((row) => [row.ticket.id, row.depth, row.isContextOnly])).toEqual([
      ["epic", 0, true],
      ["story", 1, true],
      ["subtask", 2, false],
    ]);
  });

  it("builds no-group rows as one normal hierarchy without duplicates", () => {
    const epic = createTicket({ id: "epic", issueType: "Epic" });
    const story = createTicket({ id: "story", issueType: "Story", parentId: epic.id });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
    });
    const tickets = [epic, story, subtask];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);

    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "none",
      sortBy: "key",
      sortDirection: "desc",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows.map((row) => [row.ticket.id, row.depth])).toEqual([
      ["epic", 0],
      ["story", 1],
      ["subtask", 2],
    ]);
    expect(new Set(groups[0]?.rows.map((row) => row.ticket.id))).toEqual(
      new Set(["epic", "story", "subtask"]),
    );
  });

  it("prefers epic ancestors when grouping by parent", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      ref: { displayId: "PROJ-10", title: "Checkout Revamp" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      ref: { displayId: "PROJ-11", title: "Improve cart summary" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      ref: { displayId: "PROJ-12", title: "Hook up CTA" },
    });
    const presentation = buildVisibleBacklogHierarchy([epic, story, subtask], [subtask]);

    const groups = buildProjectBacklogTableGroups({
      tickets: [subtask],
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "parent",
      sortBy: "rank",
      sortDirection: "desc",
    });

    expect(groups[0]?.label).toBe("PROJ-10");
    expect(groups[0]?.description).toBe("Checkout Revamp");
    expect(groups[0]?.rows.map((row) => [row.ticket.id, row.depth, row.isContextOnly])).toEqual([
      ["epic", 0, true],
      ["story", 1, true],
      ["subtask", 2, false],
    ]);
  });

  it("sorts table tickets by estimate while keeping missing values last", () => {
    const tickets = [
      createTicket({ id: "no-estimate", assignee: "Alex" }),
      createTicket({ id: "small", estimateValue: 2 }),
      createTicket({ id: "large", estimateValue: 8 }),
    ];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);

    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "status",
      sortBy: "estimate",
      sortDirection: "desc",
    });

    expect(groups[0]?.rows.map((row) => row.ticket.id)).toEqual(["large", "small", "no-estimate"]);
  });

  it("recognizes unchanged table rows and groups across equivalent rebuilds", () => {
    const tickets = [
      createTicket({ id: "alpha", assignee: "Alex", status: "In Progress" }),
      createTicket({ id: "beta", assignee: "Blair", status: "Backlog" }),
    ];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);

    const firstGroups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "status",
      sortBy: "rank",
      sortDirection: "desc",
    });
    const rebuiltGroups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "status",
      sortBy: "rank",
      sortDirection: "desc",
    });

    expect(
      areProjectBacklogTableRowsEqual(firstGroups[0]!.rows[0]!, rebuiltGroups[0]!.rows[0]!),
    ).toBe(true);
    expect(areProjectBacklogTableGroupsEqual(firstGroups[0]!, rebuiltGroups[0]!)).toBe(true);

    const changedRows = [...rebuiltGroups[0]!.rows];
    changedRows[0] = {
      ...changedRows[0]!,
      ticket: { ...changedRows[0]!.ticket, status: "Done" },
    };
    const changedGroup = {
      ...rebuiltGroups[0]!,
      rows: changedRows,
    };

    expect(areProjectBacklogTableRowsEqual(firstGroups[0]!.rows[0]!, changedGroup.rows[0]!)).toBe(
      false,
    );
    expect(areProjectBacklogTableGroupsEqual(firstGroups[0]!, changedGroup)).toBe(false);
  });
});
