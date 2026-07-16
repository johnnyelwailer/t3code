import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";
import { serializeBacklogCacheJson } from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  pruneStaleT3workAtlassianBacklogViews,
  T3WORK_BACKLOG_VIEW_STALE_MS,
} from "./t3work-atlassian-backlog-reconcilePrune.ts";

// The in-memory SQLite layer is shared across all tests in this `it.layer`
// block, so each test uses its own externalProjectId to avoid cross-test row
// collisions (PK conflicts and stray counts from earlier tests).
const identityFor = (externalProjectId: string) => ({
  provider: "atlassian",
  accountId: "https://test.atlassian.net",
  externalProjectId,
});

const insertView = (input: {
  identity: ReturnType<typeof identityFor>;
  selectionKey: string;
  updatedAt: number;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO t3work_atlassian_backlog_views (
        provider,
        account_id,
        external_project_id,
        selection_key,
        issue_ids_json,
        boards_json,
        sprints_json,
        saved_filters_json,
        capabilities_json,
        updated_at
      )
      VALUES (
        ${input.identity.provider},
        ${input.identity.accountId},
        ${input.identity.externalProjectId},
        ${input.selectionKey},
        '[]',
        '[]',
        '[]',
        '[]',
        '{}',
        ${input.updatedAt}
      )
    `;
  });

const countViews = (identity: ReturnType<typeof identityFor>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ count: number }>`
      SELECT COUNT(*) AS "count"
      FROM t3work_atlassian_backlog_views
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
    `;
    return rows[0]?.count ?? 0;
  });

const viewsLayer = it.layer(SqlitePersistenceMemory);

viewsLayer("pruneStaleT3workAtlassianBacklogViews", (it) => {
  it.effect("deletes only rows older than the stale threshold", () =>
    Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      const identity = identityFor("project-threshold");
      const nowMs = 1_000_000_000_000;

      yield* insertView({
        identity,
        selectionKey: "stale",
        updatedAt: nowMs - T3WORK_BACKLOG_VIEW_STALE_MS - 1,
      });
      yield* insertView({ identity, selectionKey: "fresh", updatedAt: nowMs - 1_000 });

      const pruned = yield* pruneStaleT3workAtlassianBacklogViews({ identity, nowMs });

      assert.strictEqual(pruned, 1);
      assert.strictEqual(yield* countViews(identity), 1);
    }),
  );

  it.effect("is a no-op when nothing is stale", () =>
    Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      const identity = identityFor("project-no-op");
      const nowMs = 1_000_000_000_000;

      yield* insertView({ identity, selectionKey: "fresh", updatedAt: nowMs - 1_000 });

      const pruned = yield* pruneStaleT3workAtlassianBacklogViews({ identity, nowMs });

      assert.strictEqual(pruned, 0);
      assert.strictEqual(yield* countViews(identity), 1);
    }),
  );

  it.effect("respects a custom staleMs override", () =>
    Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      const identity = identityFor("project-custom-stale-ms");
      const nowMs = 1_000_000_000_000;

      yield* insertView({ identity, selectionKey: "just-over-custom", updatedAt: nowMs - 5_001 });

      const pruned = yield* pruneStaleT3workAtlassianBacklogViews({
        identity,
        nowMs,
        staleMs: 5_000,
      });

      assert.strictEqual(pruned, 1);
      assert.strictEqual(yield* countViews(identity), 0);
    }),
  );

  it.effect("scopes deletion to the given project only", () =>
    Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      const identity = identityFor("project-scope-a");
      const otherIdentity = identityFor("project-scope-b");
      const nowMs = 1_000_000_000_000;
      const staleUpdatedAt = nowMs - T3WORK_BACKLOG_VIEW_STALE_MS - 1;

      yield* insertView({ identity, selectionKey: "stale", updatedAt: staleUpdatedAt });
      yield* insertView({
        identity: otherIdentity,
        selectionKey: "stale",
        updatedAt: staleUpdatedAt,
      });

      const pruned = yield* pruneStaleT3workAtlassianBacklogViews({ identity, nowMs });

      assert.strictEqual(pruned, 1);
      assert.strictEqual(yield* countViews(identity), 0);
      assert.strictEqual(yield* countViews(otherIdentity), 1);
    }),
  );
});

describe("T3WORK_BACKLOG_VIEW_STALE_MS", () => {
  it("is 30 days", () => {
    assert.strictEqual(T3WORK_BACKLOG_VIEW_STALE_MS, 30 * 24 * 60 * 60 * 1000);
  });
});

const insertIssue = (input: { identity: ReturnType<typeof identityFor>; issueId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO t3work_atlassian_backlog_issues (
        provider, account_id, external_project_id, issue_id, issue_key, resource_json, updated_at
      )
      VALUES (
        ${input.identity.provider}, ${input.identity.accountId}, ${input.identity.externalProjectId},
        ${input.issueId}, ${input.issueId}, ${serializeBacklogCacheJson({ id: input.issueId })}, 0
      )
    `;
  });

const countIssues = (identity: ReturnType<typeof identityFor>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ count: number }>`
      SELECT COUNT(*) AS "count"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
    `;
    return rows[0]?.count ?? 0;
  });
