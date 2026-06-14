import { assert, it } from "@effect/vitest";
import type {
  AtlassianBacklogBoard,
  AtlassianBacklogSavedFilter,
  AtlassianBacklogSprint,
} from "@t3tools/integrations-atlassian";
import type { ExternalResourceRef, ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  appendCachedT3workAtlassianBacklogSyncPage,
  readCachedT3workAtlassianBacklog,
  updateCachedT3workAtlassianBacklogAssignee,
  writeCachedT3workAtlassianBacklog,
  type T3workAtlassianBacklogCapabilities,
  type T3workAtlassianBacklogPayload,
} from "./t3work-atlassian-backlog-cache.ts";
import type { BacklogResourceRef } from "./t3work-atlassian-backlog-cacheShared.ts";

const backlogCacheLayer = it.layer(SqlitePersistenceMemory);

function createIssue(overrides?: Partial<ExternalResourceRef>): ExternalResourceRef {
  return {
    provider: "atlassian",
    kind: "issue",
    id: "10001",
    displayId: "PROJ-1",
    title: "Plan sprint",
    status: "Todo",
    assignee: "Alex",
    updatedAt: "2026-05-21T12:00:00.000Z",
    ...overrides,
  };
}

function createBacklogPayload(
  overrides?: Partial<T3workAtlassianBacklogPayload>,
): T3workAtlassianBacklogPayload {
  return {
    page: {
      items: [createIssue()],
      totalCount: 1,
    } satisfies ResourcePage,
    capabilities: {
      canCreateSubtasks: true,
    } satisfies T3workAtlassianBacklogCapabilities,
    boards: [{ id: "board-1", name: "Core board" }] satisfies ReadonlyArray<AtlassianBacklogBoard>,
    sprints: [{ id: "sprint-1", name: "Sprint 1" }] satisfies ReadonlyArray<AtlassianBacklogSprint>,
    savedFilters: [
      { id: "filter-1", name: "Only mine", jql: "assignee = currentUser()" },
    ] satisfies ReadonlyArray<AtlassianBacklogSavedFilter>,
    selectedBoardId: "board-1",
    selectedSprintId: "sprint-1",
    ...overrides,
  };
}

backlogCacheLayer("t3work Atlassian backlog cache", (it) => {
  it.effect("persists raw issue rows and resolves both request and resolved selections", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* writeCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        requestSelection: {},
        response: createBacklogPayload(),
      });

      const requestCached = yield* readCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
      });
      assert.deepStrictEqual(requestCached?.response.selectedBoardId, "board-1");
      assert.deepStrictEqual(requestCached?.response.page.items[0]?.displayId, "PROJ-1");

      const resolvedCached = yield* readCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        selection: { boardId: "board-1", sprintId: "sprint-1" },
      });
      assert.deepStrictEqual(resolvedCached?.response.page.totalCount, 1);

      const issueRows = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS "count"
        FROM t3work_atlassian_backlog_issues
      `;
      assert.deepStrictEqual(issueRows[0]?.count, 1);
    }),
  );

  it.effect("patches cached issue rows so cached views stay usable offline after mutations", () =>
    Effect.gen(function* () {
      yield* writeCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        requestSelection: { boardId: "board-1" },
        response: createBacklogPayload(),
      });

      yield* updateCachedT3workAtlassianBacklogAssignee({
        provider: "atlassian",
        accountId: "account-1",
        issueIdOrKey: "PROJ-1",
        assigneeAccountId: "account-2",
        assigneeDisplayName: "Blair",
      });

      const cached = yield* readCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        selection: { boardId: "board-1" },
      });
      const cachedItem = cached?.response.page.items[0] as BacklogResourceRef | undefined;

      assert.deepStrictEqual(cachedItem?.assignee, "Blair");
      assert.deepStrictEqual(cachedItem?.assigneeAccountId, "account-2");
    }),
  );

  it.effect(
    "reuses the newest cached project view when the default selection has no exact cache row",
    () =>
      Effect.gen(function* () {
        yield* writeCachedT3workAtlassianBacklog({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-1",
          requestSelection: { boardId: "board-1", sprintId: "sprint-1" },
          response: createBacklogPayload(),
        });

        const cached = yield* readCachedT3workAtlassianBacklog({
          provider: "atlassian",
          accountId: "account-1",
          externalProjectId: "project-1",
        });

        assert.deepStrictEqual(cached?.response.selectedBoardId, "board-1");
        assert.deepStrictEqual(cached?.response.selectedSprintId, "sprint-1");
        assert.deepStrictEqual(cached?.response.page.items[0]?.displayId, "PROJ-1");
      }),
  );

  it.effect("appends sync pages, advances the cursor, and prunes on walk completion", () =>
    Effect.gen(function* () {
      yield* writeCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        requestSelection: {},
        response: createBacklogPayload({
          page: {
            items: [createIssue()],
            nextCursor: "1",
            totalCount: 3,
          } satisfies ResourcePage,
        }),
      });

      const selectionKeys = ["board=default:sprint=default:filter=default"];
      yield* appendCachedT3workAtlassianBacklogSyncPage({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        selectionKeys,
        items: [createIssue({ id: "10002", displayId: "PROJ-2", title: "Second" })],
        cursor: { next: "2", totalCount: 3 },
      });

      const midWalk = yield* readCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
      });
      assert.deepStrictEqual(
        midWalk?.response.page.items.map((item) => item.displayId),
        ["PROJ-1", "PROJ-2"],
      );
      assert.deepStrictEqual(midWalk?.response.page.nextCursor, "2");

      // Final page: walk saw 10001 and 10003 only — 10002 was removed remotely.
      yield* appendCachedT3workAtlassianBacklogSyncPage({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        selectionKeys,
        items: [createIssue({ id: "10003", displayId: "PROJ-3", title: "Third" })],
        cursor: { next: null, totalCount: 2 },
        replaceIssueIds: ["10001", "10003"],
      });

      const completed = yield* readCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
      });
      assert.deepStrictEqual(
        completed?.response.page.items.map((item) => item.displayId),
        ["PROJ-1", "PROJ-3"],
      );
      assert.deepStrictEqual(completed?.response.page.nextCursor, undefined);
    }),
  );

  it.effect("merging a live first page keeps the synced tail instead of clobbering it", () =>
    Effect.gen(function* () {
      const selectionKeys = ["board=default:sprint=default:filter=default"];
      yield* writeCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        requestSelection: {},
        response: createBacklogPayload({
          page: { items: [createIssue()], nextCursor: "1", totalCount: 2 } satisfies ResourcePage,
        }),
      });
      yield* appendCachedT3workAtlassianBacklogSyncPage({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        selectionKeys,
        items: [createIssue({ id: "10002", displayId: "PROJ-2", title: "Second" })],
        cursor: { next: null, totalCount: 2 },
        replaceIssueIds: ["10001", "10002"],
      });

      // A later live refresh fetches only the first page again.
      const written = yield* writeCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
        requestSelection: {},
        response: createBacklogPayload({
          page: { items: [createIssue()], nextCursor: "1", totalCount: 2 } satisfies ResourcePage,
        }),
        mergeExistingTail: true,
      });

      assert.deepStrictEqual(
        written.response.page.items.map((item) => item.displayId),
        ["PROJ-1", "PROJ-2"],
      );

      const cached = yield* readCachedT3workAtlassianBacklog({
        provider: "atlassian",
        accountId: "account-1",
        externalProjectId: "project-1",
      });
      assert.deepStrictEqual(
        cached?.response.page.items.map((item) => item.displayId),
        ["PROJ-1", "PROJ-2"],
      );
    }),
  );
});
