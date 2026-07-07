import { describe, expect, it } from "vite-plus/test";

import type { AtlassianBacklogResponse } from "~/t3work/backend/t3work-types";

import {
  incrementProjectBacklogSubtaskCountResponse,
  purgeLegacyProjectBacklogLocalCache,
  updateProjectBacklogAssigneeResponse,
  updateProjectBacklogEstimateResponse,
} from "./t3work-projectBacklogCache";

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
    boards: [],
    sprints: [],
    savedFilters: [],
    quickFilters: [],
    ...overrides,
  };
}

describe("project backlog cache", () => {
  it("removes only the legacy backlog payload cache entries from local storage", () => {
    const storage = new Map<string, string>([
      [
        "t3work.integration-cache.v1:atlassian:backlog:atlassian:account-1:project-1",
        "stale-backlog",
      ],
      ["t3work:project-backlog-state:v1:project-1", "selection-state"],
      ["t3work.integration-cache.v1:github:auth", "keep-me"],
    ]);

    purgeLegacyProjectBacklogLocalCache({
      get length() {
        return storage.size;
      },
      key(index) {
        return Array.from(storage.keys())[index] ?? null;
      },
      removeItem(key) {
        storage.delete(key);
      },
    });

    expect(
      storage.get("t3work.integration-cache.v1:atlassian:backlog:atlassian:account-1:project-1"),
    ).toBeUndefined();
    expect(storage.get("t3work:project-backlog-state:v1:project-1")).toBe("selection-state");
    expect(storage.get("t3work.integration-cache.v1:github:auth")).toBe("keep-me");
  });

  it("updates cached assignee fields for inline backlog edits", () => {
    const next = updateProjectBacklogAssigneeResponse(createBacklogResponse(), "10001", {
      accountId: "account-2",
      displayName: "Blair",
    });

    expect(next.page.items[0]).toMatchObject({
      assignee: "Blair",
      assigneeAccountId: "account-2",
    });
  });

  it("updates cached estimate metadata for inline backlog edits", () => {
    const next = updateProjectBacklogEstimateResponse(createBacklogResponse(), "PROJ-1", 8, {
      mode: "points",
      estimateFieldLabel: "Story Points",
    });

    expect(next.page.items[0]).toMatchObject({ estimateValue: 8 });
    expect(next.capabilities.estimateFieldLabel).toBe("Story Points");
  });

  it("updates cached hour estimates without overwriting the shared story point label", () => {
    const next = updateProjectBacklogEstimateResponse(createBacklogResponse(), "PROJ-1", 1.5, {
      mode: "hours",
    });

    expect(next.page.items[0]).toMatchObject({
      estimateValue: 1.5,
      timeOriginalEstimateSeconds: 5400,
    });
    expect(next.capabilities.estimateFieldLabel).toBeUndefined();
  });

  it("increments cached subtask count before the background refresh completes", () => {
    const next = incrementProjectBacklogSubtaskCountResponse(createBacklogResponse(), "10001");

    expect(next.page.items[0]).toMatchObject({ subtaskCount: 2 });
  });
});
