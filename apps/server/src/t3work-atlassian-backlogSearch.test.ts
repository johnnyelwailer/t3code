import { assert, it } from "@effect/vitest";
import type { ExternalResourceRef, ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { writeCachedT3workAtlassianBacklog } from "./t3work-atlassian-backlog-cache.ts";
import { searchOfflineBacklogCache } from "./t3work-atlassian-backlogSearch.ts";

const backlogSearchLayer = it.layer(SqlitePersistenceMemory);

function createIssue(overrides?: Partial<ExternalResourceRef>): ExternalResourceRef {
  return {
    provider: "atlassian",
    kind: "issue",
    id: "10001",
    displayId: "PROJ-1",
    title: "Plan sprint",
    status: "Todo",
    assignee: "Alex",
    ...overrides,
  };
}

backlogSearchLayer("t3work Atlassian backlog offline search", (it) => {
  it.effect("matches cached issues by title and key, case-insensitively", () =>
    Effect.gen(function* () {
      yield* writeCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        requestSelection: {},
        response: {
          page: {
            items: [
              createIssue(),
              createIssue({ id: "10002", displayId: "PROJ-2", title: "Fix login crash" }),
            ],
            totalCount: 2,
          } satisfies ResourcePage,
          capabilities: { canCreateSubtasks: false },
          boards: [],
          sprints: [],
          savedFilters: [],
        },
      });

      const byTitle = yield* searchOfflineBacklogCache({
        account: { id: "account-1", provider: "atlassian" },
        externalProjectId: "project-1",
        query: "LOGIN",
        mode: "offline",
      });
      assert.deepStrictEqual(
        byTitle.items.map((item) => item.displayId),
        ["PROJ-2"],
      );

      const byKey = yield* searchOfflineBacklogCache({
        account: { id: "account-1", provider: "atlassian" },
        externalProjectId: "project-1",
        query: "proj-1",
        mode: "offline",
      });
      assert.deepStrictEqual(
        byKey.items.map((item) => item.displayId),
        ["PROJ-1"],
      );

      const blankQuery = yield* searchOfflineBacklogCache({
        account: { id: "account-1", provider: "atlassian" },
        externalProjectId: "project-1",
        query: "   ",
        mode: "offline",
      });
      assert.deepStrictEqual(blankQuery.items, []);
    }),
  );
});
