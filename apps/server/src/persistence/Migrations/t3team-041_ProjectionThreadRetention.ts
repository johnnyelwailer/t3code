import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/** Keeps ephemeral workflow children out of durable shell navigation. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN retention TEXT NOT NULL DEFAULT 'retained'
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_shell_retention
    ON projection_threads(deleted_at, archived_at, retention, project_id, created_at, thread_id)
  `;
});
