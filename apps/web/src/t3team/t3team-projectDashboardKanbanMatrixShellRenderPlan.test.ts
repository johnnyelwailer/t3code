import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { buildProjectDashboardKanbanMatrixLayout } from "./t3team-projectDashboardKanbanMatrix";
import {
  buildProjectDashboardKanbanMatrixShellRenderPlan,
  type ProjectDashboardKanbanMatrixShellRenderPlan,
} from "./t3team-projectDashboardKanbanMatrixShellRenderPlan";
import { buildProjectTicketKanbanColumns } from "./t3team-projectTicketStatus";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";

function expectSpanningPlan(
  plan: ProjectDashboardKanbanMatrixShellRenderPlan | undefined,
): Extract<ProjectDashboardKanbanMatrixShellRenderPlan, { kind: "spanning" }> {
  if (!plan || plan.kind !== "spanning") {
    throw new Error("Expected a spanning shell plan");
  }

  return plan;
}

describe("project dashboard kanban matrix shell render plan", () => {
  it("orders outer shells before nested same-lane subgroup shells", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "In Progress",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      status: "In Progress",
      ref: { displayId: "PROJ-2", title: "Nested story" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "Nested subtask" },
    });
    const acceptedChild = createTicket({
      id: "accepted-child",
      issueType: "Bug",
      parentId: epic.id,
      status: "Accepted",
      ref: { displayId: "PROJ-4", title: "Accepted child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, subtask, acceptedChild]),
      hierarchy: buildProjectTicketHierarchy([epic, story, subtask, acceptedChild]),
    });
    const plans = buildProjectDashboardKanbanMatrixShellRenderPlan(layout.shells);

    expect(plans.map((plan) => [plan.ticketId, plan.kind])).toEqual([
      ["epic", "spanning"],
      ["story", "singleLane"],
    ]);
  });

  it("renders spanning shell headers across the full shell width", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "In Progress",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const todoChild = createTicket({
      id: "todo-child",
      issueType: "Bug",
      parentId: epic.id,
      status: "To Do",
      ref: { displayId: "PROJ-2", title: "To do child" },
    });
    const inTestChild = createTicket({
      id: "in-test-child",
      issueType: "Bug",
      parentId: epic.id,
      status: "In Test",
      ref: { displayId: "PROJ-3", title: "In test child" },
    });
    const unrelatedRoot = createTicket({
      id: "unrelated-root",
      issueType: "Task",
      status: "Accepted",
      ref: { displayId: "PROJ-4", title: "Accepted root" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([todoChild, unrelatedRoot, inTestChild]),
      hierarchy: buildProjectTicketHierarchy([epic, todoChild, inTestChild, unrelatedRoot]),
    });
    const plans = buildProjectDashboardKanbanMatrixShellRenderPlan(layout.shells);
    const epicPlan = plans.find((plan) => plan.ticketId === "epic");

    const spanningPlan = expectSpanningPlan(epicPlan);

    expect(spanningPlan).toMatchObject({ columnIndex: 0, columnSpan: 3 });
    expect(spanningPlan.rowSpan).toBeGreaterThan(0);
  });

  it("renders a parent with an earlier-lane child as a spanning shell instead of a divider-only subgroup", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      status: "Accepted",
      ref: { displayId: "PROJ-1", title: "Accepted story" },
    });
    const todoChild = createTicket({
      id: "todo-child",
      issueType: "Task",
      parentId: story.id,
      status: "To Do",
      ref: { displayId: "PROJ-2", title: "Todo child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, todoChild]),
      hierarchy: buildProjectTicketHierarchy([story, todoChild]),
    });
    const plans = buildProjectDashboardKanbanMatrixShellRenderPlan(layout.shells);
    const storyPlan = plans.find((plan) => plan.ticketId === "story");

    const spanningPlan = expectSpanningPlan(storyPlan);

    expect(spanningPlan).toMatchObject({ columnIndex: 0, columnSpan: 2 });
    expect(spanningPlan.rowSpan).toBeGreaterThan(0);
  });

  it("spans shells across children that sit on both sides of the parent lane", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      status: "In Progress",
      ref: { displayId: "PROJ-1", title: "Middle story" },
    });
    const todoChild = createTicket({
      id: "todo-child",
      issueType: "Task",
      parentId: story.id,
      status: "To Do",
      ref: { displayId: "PROJ-2", title: "Todo child" },
    });
    const reviewChild = createTicket({
      id: "review-child",
      issueType: "Task",
      parentId: story.id,
      status: "In Test",
      ref: { displayId: "PROJ-3", title: "Review child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, todoChild, reviewChild]),
      hierarchy: buildProjectTicketHierarchy([story, todoChild, reviewChild]),
    });
    const plans = buildProjectDashboardKanbanMatrixShellRenderPlan(layout.shells);
    const storyPlan = plans.find((plan) => plan.ticketId === "story");

    const spanningPlan = expectSpanningPlan(storyPlan);

    expect(spanningPlan).toMatchObject({ columnIndex: 0, columnSpan: 3 });
    expect(spanningPlan.rowSpan).toBeGreaterThan(0);
  });

  it("extends the shell body into an earlier lane when that child starts below the parent header", () => {
    const blockingTodoRoot = createTicket({
      id: "blocking-todo-root",
      issueType: "Bug",
      status: "To Do",
      ref: { displayId: "PROJ-0", title: "Blocking root" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      status: "Accepted",
      ref: { displayId: "PROJ-1", title: "Accepted story" },
    });
    const todoChild = createTicket({
      id: "todo-child",
      issueType: "Task",
      parentId: story.id,
      status: "To Do",
      ref: { displayId: "PROJ-2", title: "Todo child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([blockingTodoRoot, story, todoChild]),
      hierarchy: buildProjectTicketHierarchy([blockingTodoRoot, story, todoChild]),
    });
    const plans = buildProjectDashboardKanbanMatrixShellRenderPlan(layout.shells);
    const storyPlan = plans.find((plan) => plan.ticketId === "story");
    const storyPlacement = layout.cards.find((placement) => placement.ticket.id === "story");

    const spanningPlan = expectSpanningPlan(storyPlan);

    expect(spanningPlan).toMatchObject({ columnIndex: 0, columnSpan: 2 });
    expect(spanningPlan.rowSpan).toBeGreaterThan(storyPlacement?.rowSpan ?? 0);
  });

  it("renders spanning shells as one consistent rectangle across their full width", () => {
    const ticket = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "In Progress",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const plans = buildProjectDashboardKanbanMatrixShellRenderPlan([
      {
        ticket,
        placementKey: "in-progress:epic",
        anchorColumnId: "in-progress",
        anchorColumnIndex: 0,
        endColumnIndex: 3,
        headerRowStart: 1,
        headerRowSpan: 10,
        subtreePlacementKeys: ["in-progress:epic"],
        segments: [
          { columnId: "todo", columnIndex: 0, rowStart: 1, rowSpan: 31 },
          { columnId: "accepted", columnIndex: 1, rowStart: 1, rowSpan: 41 },
          { columnId: "progress", columnIndex: 2, rowStart: 1, rowSpan: 51 },
          { columnId: "review", columnIndex: 3, rowStart: 1, rowSpan: 21 },
        ],
      },
    ]);
    const plan = expectSpanningPlan(plans[0]);

    expect(plan).toEqual({
      placementKey: "in-progress:epic",
      ticketId: "epic",
      kind: "spanning",
      columnIndex: 0,
      columnSpan: 4,
      rowStart: 1,
      rowSpan: 51,
    });
  });

  it("does not classify leftward-child shells as single-lane groups", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      status: "Accepted",
      ref: { displayId: "PROJ-1", title: "Accepted story" },
    });
    const todoChild = createTicket({
      id: "todo-child",
      issueType: "Task",
      parentId: story.id,
      status: "To Do",
      ref: { displayId: "PROJ-2", title: "Todo child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, todoChild]),
      hierarchy: buildProjectTicketHierarchy([story, todoChild]),
    });
    const plans = buildProjectDashboardKanbanMatrixShellRenderPlan(layout.shells);

    expect(plans.some((plan) => plan.ticketId === "story" && plan.kind === "singleLane")).toBe(
      false,
    );
  });

  it("creates dark single-lane subgroup plans with a divider row below the parent header", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      status: "Accepted",
      ref: { displayId: "PROJ-1", title: "Story parent" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      status: "Accepted",
      ref: { displayId: "PROJ-2", title: "Nested subtask" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, subtask]),
      hierarchy: buildProjectTicketHierarchy([story, subtask]),
    });
    const plans = buildProjectDashboardKanbanMatrixShellRenderPlan(layout.shells);
    const storyPlan = plans.find((plan) => plan.ticketId === "story");

    expect(storyPlan).toMatchObject({ kind: "singleLane", columnIndex: 0 });
    if (!storyPlan || storyPlan.kind !== "singleLane") {
      throw new Error("Expected a single-lane shell plan for the story parent");
    }

    expect(storyPlan.rowSpan).toBeGreaterThan(0);
    expect(storyPlan.dividerRow).toBeGreaterThan(storyPlan.rowStart);
  });
});
