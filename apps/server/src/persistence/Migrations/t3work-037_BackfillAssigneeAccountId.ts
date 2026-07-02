/**
 * Backfills `assignee_account_id` on pre-existing `t3work_atlassian_backlog_issues`
 * rows from the assignee already stored inside `resource_json` (Epic 33).
 *
 * Migration 36 only ADDed the column, so rows synced before it carry NULL.
 * That breaks the My Work projection's "mirror populated" gate: the mirror
 * looks populated (rows exist) while the assignee filter matches nothing, so
 * My Work confidently serves an empty page until a full reconcile walk
 * happens to rewrite every row. The data is already present in the JSON —
 * backfill it once instead of waiting on the background sync.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Guard: the table is created lazily by ensureBacklogCacheTables; skip when
  // this install has never synced a backlog.
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

  yield* sql`
    UPDATE t3work_atlassian_backlog_issues
    SET assignee_account_id = NULLIF(
      TRIM(CAST(json_extract(resource_json, '$.assigneeAccountId') AS TEXT)),
      ''
    )
    WHERE assignee_account_id IS NULL
  `;
});
