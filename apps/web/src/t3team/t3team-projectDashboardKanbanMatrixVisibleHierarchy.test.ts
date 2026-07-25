import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { resolveProjectDashboardKanbanMatrixVisibleHierarchy } from "./t3team-projectDashboardKanbanMatrixVisibleHierarchy";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";

describe("project dashboard kanban matrix visible hierarchy", () => {
  it("prefers upstream parent-child groups when they already include context parents", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "Done",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      status: "In Progress",
      ref: { displayId: "PROJ-2", title: "Visible story" },
    });

    const visibleHierarchy = buildProjectTicketHierarchy([epic, story]);
    const resolvedHierarchy = resolveProjectDashboardKanbanMatrixVisibleHierarchy({
      allTickets: [epic, story],
      matchedTickets: [story],
      parentChildGroups: visibleHierarchy,
    });

    expect(resolvedHierarchy.roots.map((ticket) => ticket.id)).toEqual(["epic"]);
    expect(resolvedHierarchy.childrenByParentId.get(epic.id)?.map((ticket) => ticket.id)).toEqual([
      "story",
    ]);
  });

  it("rebuilds visible hierarchy from all tickets when parent-child groups only contain matched tickets", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "Done",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      status: "In Progress",
      ref: { displayId: "PROJ-2", title: "Visible story" },
    });

    const resolvedHierarchy = resolveProjectDashboardKanbanMatrixVisibleHierarchy({
      allTickets: [epic, story],
      matchedTickets: [story],
      parentChildGroups: buildProjectTicketHierarchy([story]),
    });

    expect(resolvedHierarchy.roots.map((ticket) => ticket.id)).toEqual(["epic"]);
    expect(resolvedHierarchy.childrenByParentId.get(epic.id)?.map((ticket) => ticket.id)).toEqual([
      "story",
    ]);
  });
});
