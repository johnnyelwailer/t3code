import { describe, expect, it } from "vite-plus/test";

import type { AtlassianBacklogResponse } from "~/t3work/backend/t3work-types";

import {
  createProjectBacklogState,
  resolveRequestedProjectBacklogState,
} from "./t3work-projectBacklogState";

function createBacklogResponse(
  overrides?: Partial<AtlassianBacklogResponse>,
): AtlassianBacklogResponse {
  return {
    page: {
      items: [
        {
          provider: "atlassian",
          kind: "issue",
          id: "10001",
          displayId: "PROJ-1",
          title: "Plan sprint",
          status: "Todo",
          assignee: "Alex",
          assigneeAccountId: "account-1",
          estimateValue: 3,
          subtaskCount: 1,
        } as AtlassianBacklogResponse["page"]["items"][number],
      ],
    },
    capabilities: {
      canCreateSubtasks: true,
    },
    boards: [{ id: "board-1", name: "Core board" }],
    sprints: [{ id: "sprint-1", name: "Sprint 1" }],
    savedFilters: [{ id: "filter-1", name: "Only mine", jql: "assignee = currentUser()" }],
    quickFilters: [],
    ...overrides,
  };
}

describe("project backlog state", () => {
  it("preserves the current backlog payload while a new selection is loading", () => {
    const currentState = createProjectBacklogState(
      "project-1",
      createBacklogResponse({
        selectedBoardId: "board-1",
        selectedSprintId: "sprint-1",
      }),
    );

    const nextState = resolveRequestedProjectBacklogState({
      currentState,
      projectId: "project-1",
      previousProjectId: "project-1",
      selection: { boardId: "board-2", sprintId: "sprint-2" },
    });

    expect(nextState.tickets).toBe(currentState.tickets);
    expect(nextState.boards).toBe(currentState.boards);
    expect(nextState.sprints).toBe(currentState.sprints);
    expect(nextState.savedFilters).toBe(currentState.savedFilters);
    expect(nextState.selectedBoardId).toBe("board-2");
    expect(nextState.selectedSprintId).toBe("sprint-2");
  });

  it("resets to an empty backlog when switching projects without a cached response", () => {
    const currentState = createProjectBacklogState("project-1", createBacklogResponse());

    const nextState = resolveRequestedProjectBacklogState({
      currentState,
      projectId: "project-2",
      previousProjectId: "project-1",
      selection: {},
    });

    expect(nextState.tickets).toEqual([]);
    expect(nextState.boards).toEqual([]);
    expect(nextState.sprints).toEqual([]);
    expect(nextState.savedFilters).toEqual([]);
    expect(nextState.selectedBoardId).toBeUndefined();
    expect(nextState.selectedSprintId).toBeUndefined();
    expect(nextState.selectedFilterId).toBeUndefined();
  });

  it("uses cached data immediately when the requested selection already exists", () => {
    const currentState = createProjectBacklogState("project-1", createBacklogResponse());

    const nextState = resolveRequestedProjectBacklogState({
      currentState,
      projectId: "project-1",
      previousProjectId: "project-1",
      selection: { boardId: "board-2" },
      response: createBacklogResponse({
        selectedBoardId: "board-2",
        boards: [{ id: "board-2", name: "Next board" }],
      }),
    });

    expect(nextState.selectedBoardId).toBe("board-2");
    expect(nextState.boards).toEqual([{ id: "board-2", name: "Next board" }]);
    expect(nextState.tickets).toHaveLength(1);
  });
});
