import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";
import { buildProjectDashboardKanbanLaneHierarchy } from "./t3team-ProjectDashboardKanban";

describe("project dashboard kanban", () => {
  it("keeps parent context for lane subtasks when the parent is outside the lane", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "Done",
      ref: { displayId: "PROJ-0", title: "Parent epic" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      status: "Done",
      ref: { displayId: "PROJ-1", title: "Parent story" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      status: "In Progress",
      ref: { displayId: "PROJ-2", title: "Child subtask" },
    });

    const laneHierarchy = buildProjectDashboardKanbanLaneHierarchy(
      buildProjectTicketHierarchy([epic, story, subtask]),
      [subtask],
    );

    expect(laneHierarchy.roots.map((ticket) => ticket.id)).toEqual(["epic"]);
    expect(laneHierarchy.childrenByParentId.get(epic.id)?.map((ticket) => ticket.id)).toEqual([
      "story",
    ]);
    expect(laneHierarchy.childrenByParentId.get(story.id)?.map((ticket) => ticket.id)).toEqual([
      "subtask",
    ]);
  });
});
