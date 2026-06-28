import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const postgres = yield* sql<{ readonly version: string }>`SELECT version() AS version`.pipe(
    Effect.map(() => true),
    Effect.orElseSucceed(() => false),
  );

  const columns = postgres
    ? yield* sql<{ readonly name: string }>`
        SELECT column_name AS name
        FROM information_schema.columns
        WHERE table_name = 'projection_thread_sessions'
      `
    : yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_thread_sessions)
      `;
  if (!columns.some((column) => column.name === "provider_instance_id")) {
    yield* sql`
      ALTER TABLE projection_thread_sessions
      ADD COLUMN provider_instance_id TEXT
    `;
  }

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_instance
    ON projection_thread_sessions(provider_instance_id)
  `;
});
