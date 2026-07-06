/**
 * Adds the `quick_filters_json` column to `t3work_atlassian_backlog_views`
 * (Jira filter parity, Slice 2).
 *
 * The table is created lazily by `ensureBacklogCacheTables` (not by a
 * migration), so this migration must tolerate the table not existing yet.
 * For fresh installs the CREATE TABLE in ensureBacklogCacheTables already
 * includes the column; this migration is only needed for existing DBs that
 * were set up before quick filters shipped.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Guard: skip if the table doesn't exist yet.
  // On a fresh install ensureBacklogCacheTables will create the column.
  const tableExists = yield* sql<{ count: number }>`
    SELECT COUNT(*) AS "count"
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 't3work_atlassian_backlog_views'
  `.pipe(
    Effect.map((rows) => (rows[0]?.count ?? 0) > 0),
    Effect.catch(() => Effect.succeed(false)),
  );

  if (!tableExists) {
    return;
  }

  // SQLite raises an error if the column already exists; treat it as a no-op.
  yield* sql`
    ALTER TABLE t3work_atlassian_backlog_views ADD COLUMN quick_filters_json TEXT NOT NULL DEFAULT '[]'
  `.pipe(Effect.catch(() => Effect.void));

  // Backfill: buildBacklogSelectionKey now always appends a quickFilters
  // segment, so pre-existing rows (keyed without it) would never match again.
  // Rewrite them to the new format so persisted caches survive the upgrade.
  // If a new-format row already exists for the same selection (downgrade /
  // mixed-binary window), the new-format row wins: drop the legacy row first
  // so the UPDATE cannot hit a primary-key conflict. These statements are
  // deliberately NOT error-swallowed — a failed backfill should fail the
  // migration loudly, not strand invisible legacy rows.
  yield* sql`
    DELETE FROM t3work_atlassian_backlog_views
    WHERE selection_key NOT LIKE '%:quickFilters=%'
      AND EXISTS (
        SELECT 1 FROM t3work_atlassian_backlog_views AS newer
        WHERE newer.provider = t3work_atlassian_backlog_views.provider
          AND newer.account_id = t3work_atlassian_backlog_views.account_id
          AND newer.external_project_id = t3work_atlassian_backlog_views.external_project_id
          AND newer.selection_key = t3work_atlassian_backlog_views.selection_key || ':quickFilters=default'
      )
  `;
  yield* sql`
    UPDATE t3work_atlassian_backlog_views
    SET selection_key = selection_key || ':quickFilters=default'
    WHERE selection_key NOT LIKE '%:quickFilters=%'
  `;
});
