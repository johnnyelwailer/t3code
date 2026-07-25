import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectBacklogOwnershipGroups,
  buildProjectBacklogPlanningLanes,
  buildVisibleBacklogHierarchy,
  getProjectBacklogPlanningState,
} from "./t3team-projectBacklogPresentation";
import { buildProjectBacklogTableGroups } from "./t3team-projectBacklogTable";
import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";

describe("project backlog presentation", () => {
  it("preserves ancestor context for filtered child tickets", () => {
    const parent = createTicket({ id: "parent", ref: { displayId: "PROJ-1" } });
    const child = createTicket({
      id: "child",
      parentId: parent.id,
      issueType: "Sub-task",
      ref: { displayId: "PROJ-2" },
    });

    const presentation = buildVisibleBacklogHierarchy([parent, child], [child]);

    expect(presentation.visibleTickets.map((ticket) => ticket.id)).toEqual([parent.id, child.id]);
    expect(
      presentation.visibleHierarchy.childrenByParentId.get(parent.id)?.map((ticket) => ticket.id),
    ).toEqual([child.id]);
    expect(
      presentation.contextByTicketId.get(child.id)?.ancestors.map((ticket) => ticket.id),
    ).toEqual([parent.id]);
  });

  it("groups tickets into distinct planning lanes", () => {
    const tickets = [
      createTicket({ id: "both" }),
      createTicket({ id: "owner", estimateValue: 3 }),
      createTicket({ id: "estimate", assignee: "Alex" }),
      createTicket({ id: "ready", assignee: "Alex", estimateValue: 5 }),
    ];

    const lanes = buildProjectBacklogPlanningLanes(tickets);

    expect(getProjectBacklogPlanningState(tickets[0]!)).toBe("needs-owner-and-estimate");
    expect(lanes.map((lane) => [lane.id, lane.tickets.map((ticket) => ticket.id)])).toEqual([
      ["needs-owner-and-estimate", ["both"]],
      ["needs-owner", ["owner"]],
      ["needs-estimate", ["estimate"]],
      ["ready", ["ready"]],
    ]);
  });

  it("groups ownership with unassigned first", () => {
    const groups = buildProjectBacklogOwnershipGroups([
      createTicket({ id: "owned-a", assignee: "Alex", estimateValue: 2 }),
      createTicket({ id: "unassigned" }),
      createTicket({ id: "owned-b", assignee: "Blair", subtaskCount: 1 }),
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Unassigned", "Alex", "Blair"]);
    expect(groups[0]?.needsPlanCount).toBe(1);
    expect(groups[2]?.withSubtasksCount).toBe(1);
  });

  it("builds table groups in planning order", () => {
    const tickets = [
      createTicket({ id: "ready", assignee: "Alex", estimateValue: 5 }),
      createTicket({ id: "needs-owner", estimateValue: 2 }),
      createTicket({ id: "needs-estimate", assignee: "Blair" }),
    ];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);

    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "planning-state",
      sortBy: "rank",
      sortDirection: "desc",
    });

    expect(groups.map((group) => group.id)).toEqual(["needs-owner", "needs-estimate", "ready"]);
  });

  it("keeps the parent row inside a child group even when the parent is not grouped there", () => {
    const parent = createTicket({ id: "parent", ref: { displayId: "PROJ-1" } });
    const child = createTicket({
      id: "child",
      assignee: "Alex",
      parentId: parent.id,
      ref: { displayId: "PROJ-2" },
    });
    const presentation = buildVisibleBacklogHierarchy([parent, child], [child]);

    const groups = buildProjectBacklogTableGroups({
      tickets: [child],
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "assignee",
      sortBy: "rank",
      sortDirection: "desc",
    });

    expect(groups[0]?.label).toBe("Alex");
    expect(groups[0]?.matchedCount).toBe(1);
    expect(groups[0]?.contextCount).toBe(1);
    expect(groups[0]?.rows.map((row) => [row.ticket.id, row.depth, row.isContextOnly])).toEqual([
      ["parent", 0, true],
      ["child", 1, false],
    ]);
  });
});
