import { describe, expect, it } from "vite-plus/test";

import { buildVisibleBacklogHierarchy } from "./t3team-projectBacklogPresentation";
import { buildProjectBacklogTableGroups } from "./t3team-projectBacklogTable";
import {
  buildProjectBacklogTableVirtualRows,
  estimateProjectBacklogTableVirtualRowSize,
} from "./t3team-projectBacklogTableVirtualRows";
import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";

describe("project backlog table virtual rows", () => {
  it("flattens group headers and ticket rows in order", () => {
    const tickets = [
      createTicket({ id: "alpha", status: "Backlog" }),
      createTicket({ id: "beta", status: "In Progress" }),
    ];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);
    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "status",
      sortBy: "rank",
      sortDirection: "desc",
    });

    const virtualRows = buildProjectBacklogTableVirtualRows({
      groups,
      collapsedGroupIds: new Set(),
      collapsedTicketIds: new Set(),
      contextByTicketId: presentation.contextByTicketId,
    });

    expect(virtualRows.map((row) => row.kind)).toEqual([
      "group-header",
      "ticket",
      "group-header",
      "ticket",
    ]);
    expect(
      virtualRows
        .filter((row) => row.kind === "ticket")
        .map((row) => (row.kind === "ticket" ? row.row.ticket.id : null)),
    ).toEqual(expect.arrayContaining(["alpha", "beta"]));
  });

  it("omits ticket rows for collapsed groups while keeping headers", () => {
    const tickets = [createTicket({ id: "alpha", status: "Backlog" })];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);
    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "status",
      sortBy: "rank",
      sortDirection: "desc",
    });

    const virtualRows = buildProjectBacklogTableVirtualRows({
      groups,
      collapsedGroupIds: new Set([groups[0]!.id]),
      collapsedTicketIds: new Set(),
      contextByTicketId: presentation.contextByTicketId,
    });

    expect(virtualRows).toEqual([
      {
        kind: "group-header",
        key: `group:${groups[0]!.id}`,
        group: groups[0],
      },
    ]);
  });

  it("hides collapsed ticket descendants but keeps group headers", () => {
    const parent = createTicket({ id: "parent", ref: { displayId: "PROJ-1" } });
    const child = createTicket({
      id: "child",
      parentId: parent.id,
      ref: { displayId: "PROJ-2" },
    });
    const tickets = [parent, child];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);
    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "status",
      sortBy: "rank",
      sortDirection: "desc",
    });

    const virtualRows = buildProjectBacklogTableVirtualRows({
      groups,
      collapsedGroupIds: new Set(),
      collapsedTicketIds: new Set([parent.id]),
      contextByTicketId: presentation.contextByTicketId,
    });

    expect(
      virtualRows
        .filter((row) => row.kind === "ticket")
        .map((row) => (row.kind === "ticket" ? row.row.ticket.id : null)),
    ).toEqual([parent.id]);
  });

  it("omits the synthetic group header for no grouping", () => {
    const tickets = [
      createTicket({ id: "parent" }),
      createTicket({ id: "child", parentId: "parent" }),
    ];
    const presentation = buildVisibleBacklogHierarchy(tickets, tickets);
    const groups = buildProjectBacklogTableGroups({
      tickets,
      contextByTicketId: presentation.contextByTicketId,
      groupBy: "none",
      sortBy: "rank",
      sortDirection: "desc",
    });

    const virtualRows = buildProjectBacklogTableVirtualRows({
      groups,
      collapsedGroupIds: new Set(),
      collapsedTicketIds: new Set(),
      contextByTicketId: presentation.contextByTicketId,
    });

    expect(virtualRows.map((row) => row.kind)).toEqual(["ticket", "ticket"]);
  });

  it("estimates taller group headers when descriptions are present", () => {
    const group = {
      id: "group",
      label: "Sprint 1",
      description: "Active sprint",
      matchedCount: 1,
      contextCount: 0,
      rows: [],
    };

    expect(
      estimateProjectBacklogTableVirtualRowSize({
        kind: "group-header",
        key: "group:group",
        group,
      }),
    ).toBeGreaterThan(
      estimateProjectBacklogTableVirtualRowSize({
        kind: "group-header",
        key: "group:group",
        group: {
          id: group.id,
          label: group.label,
          matchedCount: group.matchedCount,
          contextCount: group.contextCount,
          rows: group.rows,
        },
      }),
    );
  });
});
