/**
 * Adds the `assignee_account_id` column and My Work index to the
 * `t3work_atlassian_backlog_issues` table (Epic 33, Wave 2).
 *
 * The table is created lazily by `ensureBacklogCacheTables` (not by a
 * migration), so this migration must tolerate the table not existing yet.
 * For fresh installs the CREATE TABLE in ensureBacklogCacheTables already
 * includes the column; this migration is only needed for existing DBs that
 * were set up before Wave 2.
 *
 * The index supports the Wave-3 My Work projection query:
 *   WHERE provider = ? AND account_id = ? AND external_project_id = ? AND assignee_account_id = ?
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
      AND name = 't3work_atlassian_backlog_issues'
  `.pipe(
    Effect.map((rows) => (rows[0]?.count ?? 0) > 0),
    Effect.catch(() => Effect.succeed(false)),
  );

  if (!tableExists) {
    return;
  }

  // SQLite raises an error if the column already exists; treat it as a no-op.
  yield* sql`
    ALTER TABLE t3work_atlassian_backlog_issues ADD COLUMN assignee_account_id TEXT
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3work_atlassian_backlog_issues_my_work
    ON t3work_atlassian_backlog_issues (provider, account_id, external_project_id, assignee_account_id)
  `;
});
