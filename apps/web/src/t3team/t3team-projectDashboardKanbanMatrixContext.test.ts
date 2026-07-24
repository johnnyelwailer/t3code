import { describe, expect, it } from "vite-plus/test";

import { buildVisibleBacklogHierarchy } from "./t3team-projectBacklogPresentation";
import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import {
  buildProjectDashboardKanbanMatrixLayout,
  resolveProjectDashboardKanbanMatrixLayout,
} from "./t3team-projectDashboardKanbanMatrix";
import { buildProjectDashboardKanbanMatrixHierarchyLayout } from "./t3team-projectDashboardKanbanMatrixHierarchy";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";
import { buildProjectTicketKanbanColumns } from "./t3team-projectTicketStatus";

describe("project dashboard kanban matrix context parents", () => {
  it("renders a context-only parent once while spanning across multiple child columns", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "Done",
      ref: { displayId: "PROJ-1", title: "Context parent" },
    });
    const acceptedStory = createTicket({
      id: "accepted-story",
      issueType: "Story",
      parentId: epic.id,
      status: "Accepted",
      ref: { displayId: "PROJ-2", title: "Accepted child" },
    });
    const inProgressBug = createTicket({
      id: "in-progress-bug",
      issueType: "Bug",
      parentId: epic.id,
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "In progress child" },
    });

    const visibleHierarchy = buildVisibleBacklogHierarchy(
      [epic, acceptedStory, inProgressBug],
      [acceptedStory, inProgressBug],
    ).visibleHierarchy;
    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([acceptedStory, inProgressBug]),
      hierarchy: visibleHierarchy,
    });
    const resolvedLayout = resolveProjectDashboardKanbanMatrixLayout({
      layout,
      measuredRowSpanByPlacementKey: new Map(),
    });

    const epicCards = layout.cards.filter((placement) => placement.ticket.id === "epic");
    const acceptedStoryCard = layout.cards.find(
      (placement) => placement.ticket.id === "accepted-story",
    );
    const epicShell = layout.shells.find((shell) => shell.ticket.id === "epic");
    const resolvedEpicCard = resolvedLayout.cards.find(
      (placement) => placement.ticket.id === "epic",
    );
    const resolvedAcceptedStoryCard = resolvedLayout.cards.find(
      (placement) => placement.ticket.id === "accepted-story",
    );

    expect(epicCards).toHaveLength(1);
    expect(epicCards[0]?.columnIndex).toBe(0);
    expect(epicCards[0]?.columnSpan).toBe(2);
    expect(acceptedStoryCard?.rowStart ?? 0).toBeGreaterThan(
      (epicCards[0]?.rowStart ?? 0) + (epicCards[0]?.rowSpan ?? 0) - 1,
    );
    expect(resolvedAcceptedStoryCard?.rowStart ?? 0).toBeGreaterThan(
      (resolvedEpicCard?.rowStart ?? 0) + (resolvedEpicCard?.rowSpan ?? 0) - 1,
    );
    expect(epicShell?.endColumnIndex).toBe(1);
  });

  it("renders visible descendants even when their parents are context-only", () => {
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
      status: "Done",
      ref: { displayId: "PROJ-2", title: "Story parent" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "Visible child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([subtask]),
      hierarchy: buildVisibleBacklogHierarchy([epic, story, subtask], [subtask]).visibleHierarchy,
    });

    expect(layout.cards.map((placement) => placement.ticket.id)).toEqual([
      "epic",
      "story",
      "subtask",
    ]);
  });

  it("restores context parents as top-level lane hierarchy cards", () => {
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
      status: "Done",
      ref: { displayId: "PROJ-2", title: "Story parent" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "Visible child" },
    });

    const layout = buildProjectDashboardKanbanMatrixHierarchyLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([subtask]),
      parentChildGroups: buildProjectTicketHierarchy([epic, story, subtask]),
    });

    expect(
      layout.placements.map((placement) => [placement.ticket.id, placement.isContextOnly]),
    ).toEqual([["epic", true]]);
  });
});
