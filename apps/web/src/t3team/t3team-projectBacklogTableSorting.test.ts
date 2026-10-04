import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogState } from "./hooks/t3team-projectBacklogState";
import { sortProjectBacklogTableTickets } from "./t3team-projectBacklogTableSorting";
import type { AtlassianBacklogResponse } from "./backend/t3team-types";

function backlogItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    provider: "atlassian",
    kind: "issue",
    id,
    displayId: id,
    title: id,
    url: `https://example.test/browse/${id}`,
    projectId: "external-1",
    status: "To Do",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("project backlog table rank sort", () => {
  it("follows the board rank the server returned, not readiness or recency", () => {
    // Server order is Jira Rank. The last item is the most recently updated
    // and the only "ready" one (estimate + assignee), which the readiness
    // heuristic would float to the top.
    const response = {
      page: {
        items: [
          backlogItem("PROJ-7", { updatedAt: "2026-09-01T00:00:00.000Z" }),
          backlogItem("PROJ-2", { updatedAt: "2026-09-02T00:00:00.000Z" }),
          backlogItem("PROJ-9", {
            updatedAt: "2026-09-30T00:00:00.000Z",
            assignee: "Ada",
            estimateValue: 3,
          }),
        ],
      },
      capabilities: { canCreateSubtasks: false },
      boards: [],
      sprints: [],
      savedFilters: [],
      quickFilters: [],
    } as unknown as AtlassianBacklogResponse;
    const { tickets } = createProjectBacklogState("project-1", response);
    const shuffled = [tickets[2]!, tickets[0]!, tickets[1]!];

    const ascending = sortProjectBacklogTableTickets({
      tickets: shuffled,
      sortBy: "rank",
      sortDirection: "asc",
    });
    const descending = sortProjectBacklogTableTickets({
      tickets: shuffled,
      sortBy: "rank",
      sortDirection: "desc",
    });

    // "desc" is the default rank direction: highest rank first, as on the board.
    expect(descending.map((ticket) => ticket.id)).toEqual(["PROJ-7", "PROJ-2", "PROJ-9"]);
    expect(ascending.map((ticket) => ticket.id)).toEqual(["PROJ-9", "PROJ-2", "PROJ-7"]);
  });

  it("keeps unranked tickets after the ranked board order", () => {
    const response = {
      page: { items: [backlogItem("PROJ-7"), backlogItem("PROJ-2")] },
      capabilities: { canCreateSubtasks: false },
      boards: [],
      sprints: [],
      savedFilters: [],
      quickFilters: [],
    } as unknown as AtlassianBacklogResponse;
    const { tickets } = createProjectBacklogState("project-1", response);
    // A live-search hit: ready and freshly updated, so the readiness fallback
    // alone would rank it above both board tickets.
    const searchHit = {
      ...tickets[0]!,
      id: "PROJ-50",
      assignee: "Ada",
      estimateValue: 5,
      updatedAt: "2026-09-30T00:00:00.000Z",
      ref: { ...tickets[0]!.ref, id: "PROJ-50", displayId: "PROJ-50" },
    };
    delete (searchHit as { boardRank?: number }).boardRank;

    for (const sortDirection of ["asc", "desc"] as const) {
      const sorted = sortProjectBacklogTableTickets({
        tickets: [searchHit, tickets[1]!, tickets[0]!],
        sortBy: "rank",
        sortDirection,
      });
      expect(sorted.at(-1)?.id).toBe("PROJ-50");
    }
  });
});
