import { describe, expect, it } from "vite-plus/test";

import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";
import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { buildProjectDashboardKanbanMatrixLayout } from "./t3team-projectDashboardKanbanMatrix";
import {
  buildProjectDashboardKanbanMatrixHierarchyLayout,
  getProjectDashboardKanbanMatrixRowSpanForHeight,
  resolveProjectDashboardKanbanMatrixHierarchyLayout,
} from "./t3team-projectDashboardKanbanMatrixHierarchy";
import { resolveProjectDashboardKanbanMatrixLayout } from "./t3team-projectDashboardKanbanMatrixResolve";
import { buildProjectTicketKanbanColumns } from "./t3team-projectTicketStatus";

function getProjectDashboardKanbanMatrixShellRowEnd(shell: {
  headerRowStart: number;
  headerRowSpan: number;
  segments: readonly { rowStart: number; rowSpan: number }[];
}): number {
  return shell.segments.reduce(
    (currentMax, segment) => Math.max(currentMax, segment.rowStart + segment.rowSpan - 1),
    shell.headerRowStart + shell.headerRowSpan - 1,
  );
}

describe("project dashboard kanban matrix", () => {
  it("keeps neighboring lane cards dense when a tall parent subtree stays in another column", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "Selected for Development",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const storyA = createTicket({
      id: "story-a",
      issueType: "Story",
      parentId: epic.id,
      status: "Selected for Development",
      ref: { displayId: "PROJ-2", title: "Story A" },
    });
    const storyB = createTicket({
      id: "story-b",
      issueType: "Story",
      parentId: epic.id,
      status: "Selected for Development",
      ref: { displayId: "PROJ-3", title: "Story B" },
    });
    const bugA = createTicket({
      id: "bug-a",
      issueType: "Bug",
      status: "In Progress",
      ref: { displayId: "PROJ-4", title: "Bug A" },
    });
    const bugB = createTicket({
      id: "bug-b",
      issueType: "Bug",
      status: "In Progress",
      ref: { displayId: "PROJ-5", title: "Bug B" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([epic, storyA, storyB, bugA, bugB]),
      hierarchy: buildProjectTicketHierarchy([epic, storyA, storyB, bugA, bugB]),
    });

    const bugAPlacement = layout.cards.find((placement) => placement.ticket.id === "bug-a");
    const bugBPlacement = layout.cards.find((placement) => placement.ticket.id === "bug-b");
    const storyBPlacement = layout.cards.find((placement) => placement.ticket.id === "story-b");

    expect(bugAPlacement?.columnIndex).toBe(1);
    expect(bugAPlacement?.rowStart).toBe(1);
    expect(bugBPlacement?.columnIndex).toBe(1);
    expect(bugBPlacement?.rowStart).toBe(
      (bugAPlacement?.rowStart ?? 0) + (bugAPlacement?.rowSpan ?? 0) + 1,
    );
    expect(bugBPlacement?.rowStart ?? 0).toBeLessThan(storyBPlacement?.rowStart ?? 0);
  });

  it("spans parent shells only to the furthest descendant column and descendant columns", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "Selected for Development",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      status: "Selected for Development",
      ref: { displayId: "PROJ-2", title: "Story child" },
    });
    const bug = createTicket({
      id: "bug",
      issueType: "Bug",
      parentId: epic.id,
      status: "Done",
      ref: { displayId: "PROJ-3", title: "Bug child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([epic, story, bug]),
      hierarchy: buildProjectTicketHierarchy([epic, story, bug]),
    });

    const epicShell = layout.shells.find((shell) => shell.ticket.id === "epic");
    const epicCards = layout.cards.filter((placement) => placement.ticket.id === "epic");

    expect(epicCards).toHaveLength(1);
    expect(epicShell?.anchorColumnIndex).toBe(0);
    expect(epicShell?.endColumnIndex).toBe(1);
    expect(epicShell?.segments.map((segment) => segment.columnIndex)).toEqual([0, 1]);
  });

  it("creates a single-lane shell for parent chains that stay in one column", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      status: "Accepted",
      ref: { displayId: "PROJ-1", title: "Story parent" },
    });
    const bug = createTicket({
      id: "bug",
      issueType: "Bug",
      parentId: story.id,
      status: "Accepted",
      ref: { displayId: "PROJ-2", title: "Bug child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, bug]),
      hierarchy: buildProjectTicketHierarchy([story, bug]),
    });

    const storyShell = layout.shells.find((shell) => shell.ticket.id === "story");

    expect(storyShell?.anchorColumnIndex).toBe(0);
    expect(storyShell?.endColumnIndex).toBe(0);
    expect(storyShell?.segments.map((segment) => segment.columnIndex)).toEqual([0]);
  });

  it("creates nested subgroup shells when a same-lane story lives inside a spanning parent", () => {
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

    expect(layout.shells.map((shell) => shell.ticket.id)).toEqual(
      expect.arrayContaining(["epic", "story"]),
    );

    const epicShell = layout.shells.find((shell) => shell.ticket.id === "epic");
    const storyShell = layout.shells.find((shell) => shell.ticket.id === "story");

    expect(epicShell?.endColumnIndex).toBeGreaterThan(epicShell?.anchorColumnIndex ?? 0);
    expect(storyShell?.anchorColumnIndex).toBe(storyShell?.endColumnIndex);
  });

  it("keeps parent cards in their own status lane when a child sits in an earlier lane", () => {
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

    const storyPlacement = layout.cards.find((placement) => placement.ticket.id === "story");
    const todoChildPlacement = layout.cards.find(
      (placement) => placement.ticket.id === "todo-child",
    );
    const storyShell = layout.shells.find((shell) => shell.ticket.id === "story");

    expect(storyPlacement?.columnIndex).toBe(1);
    expect(storyPlacement?.columnSpan).toBe(1);
    expect(todoChildPlacement?.columnIndex).toBe(0);
    expect(storyShell?.anchorColumnIndex).toBe(1);
    expect(storyShell?.segments.map((segment) => segment.columnIndex)).toEqual([0, 1]);
  });

  it("tracks shell segments across earlier and later descendant lanes", () => {
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
    const inTestChild = createTicket({
      id: "in-test-child",
      issueType: "Task",
      parentId: story.id,
      status: "In Test",
      ref: { displayId: "PROJ-3", title: "In test child" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, todoChild, inTestChild]),
      hierarchy: buildProjectTicketHierarchy([story, todoChild, inTestChild]),
    });

    const storyPlacement = layout.cards.find((placement) => placement.ticket.id === "story");
    const storyShell = layout.shells.find((shell) => shell.ticket.id === "story");

    expect(storyPlacement?.columnIndex).toBe(1);
    expect(storyPlacement?.columnSpan).toBe(2);
    expect(storyShell?.anchorColumnIndex).toBe(1);
    expect(storyShell?.endColumnIndex).toBe(2);
    expect(storyShell?.segments.map((segment) => segment.columnIndex)).toEqual([0, 1, 2]);
  });

  it("preserves earlier-lane descendant shell segments after measured reflow", () => {
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
    const storyPlacementKey = layout.cards.find(
      (placement) => placement.ticket.id === "story",
    )?.placementKey;
    const resolvedLayout = resolveProjectDashboardKanbanMatrixLayout({
      layout,
      measuredRowSpanByPlacementKey: new Map(storyPlacementKey ? [[storyPlacementKey, 16]] : []),
    });
    const resolvedStoryShell = resolvedLayout.shells.find((shell) => shell.ticket.id === "story");

    expect(resolvedStoryShell?.headerRowSpan).toBe(16);
    expect(resolvedStoryShell?.segments.map((segment) => segment.columnIndex)).toEqual([0, 1]);
  });

  it("reserves a full spanning shell rectangle before placing later roots", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "In Progress",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const todoChild = createTicket({
      id: "todo-child",
      issueType: "Task",
      parentId: epic.id,
      status: "To Do",
      ref: { displayId: "PROJ-2", title: "Todo child" },
    });
    const progressStory = createTicket({
      id: "progress-story",
      issueType: "Story",
      parentId: epic.id,
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "Progress story" },
    });
    const progressSubtask = createTicket({
      id: "progress-subtask",
      issueType: "Task",
      parentId: progressStory.id,
      status: "In Progress",
      ref: { displayId: "PROJ-4", title: "Progress subtask" },
    });
    const laterTodoRoot = createTicket({
      id: "later-root",
      issueType: "Bug",
      status: "To Do",
      ref: { displayId: "PROJ-5", title: "Later root" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([
        epic,
        todoChild,
        progressStory,
        progressSubtask,
        laterTodoRoot,
      ]),
      hierarchy: buildProjectTicketHierarchy([
        epic,
        todoChild,
        progressStory,
        progressSubtask,
        laterTodoRoot,
      ]),
    });
    const epicShell = layout.shells.find((shell) => shell.ticket.id === "epic");
    const laterRootPlacement = layout.cards.find(
      (placement) => placement.ticket.id === "later-root",
    );
    const progressStoryPlacementKey = layout.cards.find(
      (placement) => placement.ticket.id === "progress-story",
    )?.placementKey;
    const resolvedLayout = resolveProjectDashboardKanbanMatrixLayout({
      layout,
      measuredRowSpanByPlacementKey: new Map(
        progressStoryPlacementKey ? [[progressStoryPlacementKey, 20]] : [],
      ),
    });
    const resolvedEpicShell = resolvedLayout.shells.find((shell) => shell.ticket.id === "epic");
    const resolvedLaterRootPlacement = resolvedLayout.cards.find(
      (placement) => placement.ticket.id === "later-root",
    );

    expect(laterRootPlacement?.rowStart ?? 0).toBeGreaterThan(
      epicShell ? getProjectDashboardKanbanMatrixShellRowEnd(epicShell) : 0,
    );
    expect(resolvedLaterRootPlacement?.rowStart ?? 0).toBeGreaterThan(
      resolvedEpicShell ? getProjectDashboardKanbanMatrixShellRowEnd(resolvedEpicShell) : 0,
    );
  });

  it("adds bottom padding inside grouped shells without letting the next root overlap them", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      status: "In Progress",
      ref: { displayId: "PROJ-1", title: "Grouped story" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Task",
      parentId: story.id,
      status: "In Progress",
      ref: { displayId: "PROJ-2", title: "Grouped subtask" },
    });
    const nextRoot = createTicket({
      id: "next-root",
      issueType: "Bug",
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "Separate root" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, subtask, nextRoot]),
      hierarchy: buildProjectTicketHierarchy([story, subtask, nextRoot]),
    });
    const storyShell = layout.shells.find((shell) => shell.ticket.id === "story");
    const subtaskPlacement = layout.cards.find((placement) => placement.ticket.id === "subtask");
    const nextRootPlacement = layout.cards.find((placement) => placement.ticket.id === "next-root");

    const subtaskRowEnd = (subtaskPlacement?.rowStart ?? 0) + (subtaskPlacement?.rowSpan ?? 0) - 1;
    const shellRowEnd = storyShell ? getProjectDashboardKanbanMatrixShellRowEnd(storyShell) : 0;

    expect(shellRowEnd).toBeGreaterThan(subtaskRowEnd);
    expect(nextRootPlacement?.rowStart ?? 0).toBeGreaterThan(shellRowEnd);
  });

  it("keeps grouped children tighter than separate outer groups", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      status: "In Progress",
      ref: { displayId: "PROJ-1", title: "Grouped story" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Task",
      parentId: story.id,
      status: "In Progress",
      ref: { displayId: "PROJ-2", title: "Grouped subtask" },
    });
    const nextRoot = createTicket({
      id: "next-root",
      issueType: "Bug",
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "Separate root" },
    });

    const layout = buildProjectDashboardKanbanMatrixLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([story, subtask, nextRoot]),
      hierarchy: buildProjectTicketHierarchy([story, subtask, nextRoot]),
    });
    const storyPlacement = layout.cards.find((placement) => placement.ticket.id === "story");
    const subtaskPlacement = layout.cards.find((placement) => placement.ticket.id === "subtask");
    const nextRootPlacement = layout.cards.find((placement) => placement.ticket.id === "next-root");
    const storyShell = layout.shells.find((shell) => shell.ticket.id === "story");

    expect(subtaskPlacement?.rowStart).toBe(
      (storyPlacement?.rowStart ?? 0) + (storyPlacement?.rowSpan ?? 0),
    );
    expect(nextRootPlacement?.rowStart ?? 0).toBeGreaterThan(
      storyShell ? getProjectDashboardKanbanMatrixShellRowEnd(storyShell) : 0,
    );
  });

  it("reflows later roots after a measured subtree grows taller than the estimate", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "In Progress",
      ref: { displayId: "PROJ-1", title: "Epic parent" },
    });
    const bug = createTicket({
      id: "bug",
      issueType: "Bug",
      parentId: epic.id,
      status: "To Do",
      ref: { displayId: "PROJ-2", title: "Nested child" },
    });
    const nextRoot = createTicket({
      id: "next-root",
      issueType: "Bug",
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "Next root" },
    });

    const baseLayout = buildProjectDashboardKanbanMatrixHierarchyLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([epic, bug, nextRoot]),
      parentChildGroups: buildProjectTicketHierarchy([epic, bug, nextRoot]),
    });
    const nextRootBasePlacement = baseLayout.placements.find(
      (placement) => placement.ticket.id === "next-root",
    );
    const epicPlacementKey = baseLayout.placements.find(
      (placement) =>
        placement.ticket.id === "epic" &&
        placement.columnIndex === nextRootBasePlacement?.columnIndex,
    )?.placementKey;
    const resolvedLayout = resolveProjectDashboardKanbanMatrixHierarchyLayout({
      layout: baseLayout,
      measuredRowSpanByPlacementKey: new Map(epicPlacementKey ? [[epicPlacementKey, 24]] : []),
    });

    const epicPlacement = resolvedLayout.placements.find(
      (placement) =>
        placement.ticket.id === "epic" &&
        placement.columnIndex === nextRootBasePlacement?.columnIndex,
    );
    const nextRootPlacement = resolvedLayout.placements.find(
      (placement) => placement.ticket.id === "next-root",
    );

    expect(epicPlacement?.rowSpan).toBe(24);
    expect(nextRootPlacement?.rowStart).toBe(26);
  });

  it("converts measured content height into fixed-grid row spans", () => {
    expect(
      getProjectDashboardKanbanMatrixRowSpanForHeight({
        heightPx: 190,
        rowHeightPx: 8,
        rowGapPx: 4,
      }),
    ).toBe(17);
  });

  it("keeps measured row spans isolated per column placement for shared parents", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      status: "Done",
      ref: { displayId: "PROJ-1", title: "Shared parent" },
    });
    const todoChild = createTicket({
      id: "todo-child",
      issueType: "Bug",
      parentId: epic.id,
      status: "To Do",
      ref: { displayId: "PROJ-2", title: "To do child" },
    });
    const inProgressChild = createTicket({
      id: "in-progress-child",
      issueType: "Bug",
      parentId: epic.id,
      status: "In Progress",
      ref: { displayId: "PROJ-3", title: "In progress child" },
    });

    const baseLayout = buildProjectDashboardKanbanMatrixHierarchyLayout({
      kanbanColumns: buildProjectTicketKanbanColumns([todoChild, inProgressChild]),
      parentChildGroups: buildProjectTicketHierarchy([epic, todoChild, inProgressChild]),
    });
    const todoEpicPlacementKey = baseLayout.placements.find(
      (placement) => placement.columnIndex === 0 && placement.ticket.id === "epic",
    )?.placementKey;
    const inProgressEpicPlacementKey = baseLayout.placements.find(
      (placement) => placement.columnIndex === 1 && placement.ticket.id === "epic",
    )?.placementKey;
    const resolvedLayout = resolveProjectDashboardKanbanMatrixHierarchyLayout({
      layout: baseLayout,
      measuredRowSpanByPlacementKey: new Map([
        ...(todoEpicPlacementKey ? [[todoEpicPlacementKey, 24] as const] : []),
        ...(inProgressEpicPlacementKey ? [[inProgressEpicPlacementKey, 12] as const] : []),
      ]),
    });

    expect(
      resolvedLayout.placements
        .filter((placement) => placement.ticket.id === "epic")
        .map((placement) => [placement.columnId, placement.rowSpan]),
    ).toEqual([
      [baseLayout.placements[0]?.columnId, 24],
      [baseLayout.placements[1]?.columnId, 12],
    ]);
  });
});
