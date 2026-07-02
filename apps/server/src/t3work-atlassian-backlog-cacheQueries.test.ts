import { assert, it } from "@effect/vitest";
import type { ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  hasMirrorRowsForProject,
  readMyWorkIssueRows,
} from "./t3work-atlassian-backlog-cacheQueries.ts";
import type { BacklogResourceRef } from "./t3work-atlassian-backlog-cacheShared.ts";
import { writeCachedT3workAtlassianBacklog } from "./t3work-atlassian-backlog-cache.ts";

const cacheQueriesLayer = it.layer(SqlitePersistenceMemory);

// Production identifier semantics (normalize.ts): `id` and `displayId` are
// BOTH the Jira issue key (e.g. "PROJ-1"), and `parentId` is the parent's
// key — there are no separate numeric ids in mirrored rows.
function createIssue(overrides?: Partial<BacklogResourceRef>): BacklogResourceRef {
  return {
    provider: "atlassian",
    kind: "issue",
    id: "PROJ-1",
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
                  id: "PROJ-1",
                  displayId: "PROJ-1",
                  parentId: "PROJ-99",
                  assigneeAccountId: "viewer-1",
                }),
                // Assigned to the viewer, no parent.
                createIssue({
                  id: "PROJ-2",
                  displayId: "PROJ-2",
                  title: "Second",
                  assigneeAccountId: "viewer-1",
                }),
                // Assigned to someone else — must be excluded entirely.
                createIssue({
                  id: "PROJ-3",
                  displayId: "PROJ-3",
                  title: "Third",
                  assignee: "Blair",
                  assigneeAccountId: "someone-else",
                }),
                // The parent epic itself, unassigned — should come back as a parent.
                createIssue({
                  id: "PROJ-99",
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
                  id: "PROJ-201",
                  displayId: "PROJ-201",
                  parentId: "PROJ-202",
                  assigneeAccountId: "viewer-1",
                }),
                // The parent is ALSO assigned to the viewer.
                createIssue({
                  id: "PROJ-202",
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

  it.effect(
    "orders assigned and parent rows by resource_json updatedAt DESC, issue_id ASC, deterministically across reads",
    () =>
      Effect.gen(function* () {
        // Insert in a shuffled order with distinct updatedAt timestamps so a
        // correct query must actively sort rather than happening to match
        // insertion order.
        yield* writeCachedT3workAtlassianBacklog({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-ordering",
          requestSelection: {},
          response: {
            page: {
              items: [
                createIssue({
                  id: "PROJ-3",
                  displayId: "PROJ-3",
                  updatedAt: "2026-05-21T09:00:00.000Z",
                  assigneeAccountId: "viewer-1",
                }),
                createIssue({
                  id: "PROJ-1",
                  displayId: "PROJ-1",
                  updatedAt: "2026-05-21T12:00:00.000Z",
                  assigneeAccountId: "viewer-1",
                }),
                createIssue({
                  id: "PROJ-2",
                  displayId: "PROJ-2",
                  updatedAt: "2026-05-21T11:00:00.000Z",
                  assigneeAccountId: "viewer-1",
                }),
                // Same updatedAt as PROJ-1 — issue_id ASC is the tiebreaker.
                createIssue({
                  id: "PROJ-0",
                  displayId: "PROJ-0",
                  updatedAt: "2026-05-21T12:00:00.000Z",
                  assigneeAccountId: "viewer-1",
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

        const identity = {
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-ordering",
          viewerAccountId: "viewer-1",
        };

        const expectedOrder = ["PROJ-0", "PROJ-1", "PROJ-2", "PROJ-3"];

        const first = yield* readMyWorkIssueRows(identity);
        assert.deepStrictEqual(first.assigned.map((item) => item.displayId), expectedOrder);

        // Read again: order must be identical (no nondeterminism from lack of
        // an ORDER BY).
        const second = yield* readMyWorkIssueRows(identity);
        assert.deepStrictEqual(second.assigned.map((item) => item.displayId), expectedOrder);
      }),
  );
});

const hasMirrorRowsLayer = it.layer(SqlitePersistenceMemory);

hasMirrorRowsLayer("t3work Atlassian mirror hasMirrorRowsForProject", (it) => {
  it.effect("returns false when no rows are mirrored for the project", () =>
    Effect.gen(function* () {
      const result = yield* hasMirrorRowsForProject({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-no-rows",
      });
      assert.strictEqual(result, false);
    }),
  );

  it.effect(
    "returns true once rows are mirrored, even if none are assigned to the viewer",
    () =>
      Effect.gen(function* () {
        yield* writeCachedT3workAtlassianBacklog({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-mirrored-zero-assigned",
          requestSelection: {},
          response: {
            page: {
              items: [
                createIssue({
                  id: "PROJ-401",
                  displayId: "PROJ-401",
                  assigneeAccountId: "someone-else",
                }),
              ],
              totalCount: 1,
            } satisfies ResourcePage,
            capabilities: { canCreateSubtasks: true },
            boards: [],
            sprints: [],
            savedFilters: [],
          },
        });

        const hasRows = yield* hasMirrorRowsForProject({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-mirrored-zero-assigned",
        });
        assert.strictEqual(hasRows, true);

        // Fix 2's decision logic: mirror has rows for the project but the
        // viewer has zero assigned issues -> the projection is a legitimate
        // empty result (no live fallback), not "mirror not populated".
        const projection = yield* readMyWorkIssueRows({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-mirrored-zero-assigned",
          viewerAccountId: "viewer-1",
        });
        assert.deepStrictEqual(projection.assigned, []);
        assert.deepStrictEqual(projection.parents, []);
      }),
  );
});
