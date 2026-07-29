import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Repair for databases migrated before the t3work -> t3team rebrand.
 *
 * Migration 033 originally shipped as `ProjectionThreadMessageT3workExt`,
 * adding `t3work_ext_json`. The rebrand renamed the column INSIDE that
 * already-applied migration, and the migrator keys the ledger by id — so a
 * pre-rebrand database counts 033 as done and never gains `t3team_ext_json`,
 * which every message query now selects (the read path fails with SqlError).
 * A rename preserves the stored t3team extension payloads; re-adding an empty
 * column would silently drop them.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const columns = yield* sql<{ readonly name: string }>`
    SELECT name FROM pragma_table_info('projection_thread_messages')
  `;
  const names = new Set(columns.map((column) => column.name));

  if (names.has("t3work_ext_json") && !names.has("t3team_ext_json")) {
    yield* sql`
      ALTER TABLE projection_thread_messages
      RENAME COLUMN t3work_ext_json TO t3team_ext_json
    `;
  }
});
