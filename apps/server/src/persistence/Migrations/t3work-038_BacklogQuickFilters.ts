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
});
