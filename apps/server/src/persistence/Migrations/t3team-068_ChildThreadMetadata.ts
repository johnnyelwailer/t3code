/**
 * Fork child-thread metadata (ledger id 90): what a delegated child carries
 * beyond V2 lineage — the work item (ticket) it belongs to and the visible
 * thread it is placed under when that differs from its lineage parent.
 * Written by `t3team-childThreadMetadata.ts` when delegate_task creates a child.
 */
import * as SqlClient from "effect/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_child_thread_metadata (
      child_thread_id TEXT PRIMARY KEY,
      parent_thread_id TEXT NOT NULL,
      placement_thread_id TEXT,
      ticket_id TEXT,
      created_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3team_child_thread_metadata_parent
    ON t3team_child_thread_metadata(parent_thread_id)
  `;
});
