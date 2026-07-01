import { assert, it } from "@effect/vitest";
import type { ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { readMyWorkIssueRows } from "./t3work-atlassian-backlog-cacheQueries.ts";
import type { BacklogResourceRef } from "./t3work-atlassian-backlog-cacheShared.ts";
import { writeCachedT3workAtlassianBacklog } from "./t3work-atlassian-backlog-cache.ts";

const cacheQueriesLayer = it.layer(SqlitePersistenceMemory);

function createIssue(overrides?: Partial<BacklogResourceRef>): BacklogResourceRef {
  return {
    provider: "atlassian",
    kind: "issue",
    id: "10001",
    displayId: "PROJ-1",
    title: "Plan sprint",
    status: "Todo",
    updatedAt: "2026-05-21T12:00:00.000Z",
    ...overrides,
  };
}

cacheQueriesLayer("t3work Atlassian My Work projection query", (it) => {
  it.effect(
    "returns only issues assigned to the viewer plus one level of missing parents",
    () =>
      Effect.gen(function* () {
        yield* writeCachedT3workAtlassianBacklog({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-parents",
          requestSelection: {},
          response: {
            page: {
              items: [
                // Assigned to the viewer, with a parent not otherwise present.
                createIssue({
                  id: "10001",
                  displayId: "PROJ-1",
                  parentId: "10099",
                  assigneeAccountId: "viewer-1",
                }),
                // Assigned to the viewer, no parent.
                createIssue({
                  id: "10002",
                  displayId: "PROJ-2",
                  title: "Second",
                  assigneeAccountId: "viewer-1",
                }),
                // Assigned to someone else — must be excluded entirely.
                createIssue({
                  id: "10003",
                  displayId: "PROJ-3",
                  title: "Third",
                  assignee: "Blair",
                  assigneeAccountId: "someone-else",
                }),
                // The parent epic itself, unassigned — should come back as a parent.
                createIssue({
                  id: "10099",
                  displayId: "PROJ-99",
                  title: "Epic parent",
                }),
              ],
              totalCount: 4,
            } satisfies ResourcePage,
            capabilities: { canCreateSubtasks: true },
            boards: [],
            sprints: [],
            savedFilters: [],
          },
        });

        const projection = yield* readMyWorkIssueRows({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-parents",
          viewerAccountId: "viewer-1",
        });

        assert.deepStrictEqual(
          projection.assigned.map((item) => item.displayId).sort(),
          ["PROJ-1", "PROJ-2"],
        );
        assert.deepStrictEqual(
          projection.parents.map((item) => item.displayId),
          ["PROJ-99"],
        );
      }),
  );

  it.effect(
    "does not re-fetch a parent that is already in the assigned set",
    () =>
      Effect.gen(function* () {
        yield* writeCachedT3workAtlassianBacklog({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-parent-assigned",
          requestSelection: {},
          response: {
            page: {
              items: [
                createIssue({
                  id: "20001",
                  displayId: "PROJ-201",
                  parentId: "20002",
                  assigneeAccountId: "viewer-1",
                }),
                // The parent is ALSO assigned to the viewer.
                createIssue({
                  id: "20002",
                  displayId: "PROJ-202",
                  title: "Parent also assigned",
                  assigneeAccountId: "viewer-1",
                }),
              ],
              totalCount: 2,
            } satisfies ResourcePage,
            capabilities: { canCreateSubtasks: true },
            boards: [],
            sprints: [],
            savedFilters: [],
          },
        });

        const projection = yield* readMyWorkIssueRows({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-parent-assigned",
          viewerAccountId: "viewer-1",
        });

        assert.deepStrictEqual(
          projection.assigned.map((item) => item.displayId).sort(),
          ["PROJ-201", "PROJ-202"],
        );
        assert.deepStrictEqual(projection.parents, []);
      }),
  );

  it.effect("returns empty projection when the viewer has no assigned issues", () =>
    Effect.gen(function* () {
      yield* writeCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-empty",
        requestSelection: {},
        response: {
          page: {
            items: [createIssue({ assigneeAccountId: "someone-else" })],
            totalCount: 1,
          } satisfies ResourcePage,
          capabilities: { canCreateSubtasks: true },
          boards: [],
          sprints: [],
          savedFilters: [],
        },
      });

      const projection = yield* readMyWorkIssueRows({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-empty",
        viewerAccountId: "viewer-1",
      });

      assert.deepStrictEqual(projection.assigned, []);
      assert.deepStrictEqual(projection.parents, []);
    }),
  );
});
