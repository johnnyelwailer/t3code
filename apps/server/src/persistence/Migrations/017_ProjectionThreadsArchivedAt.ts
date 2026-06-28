import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

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
        WHERE table_name = 'projection_threads'
      `
    : yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;

  if (columns.some((column) => column.name === "archived_at")) {
    return;
  }

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN archived_at TEXT
  `;
});
