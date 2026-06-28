import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const postgres = yield* sql<{ readonly version: string }>`SELECT version() AS version`.pipe(
    Effect.map(() => true),
    Effect.orElseSucceed(() => false),
  );

  const sessionColumns = postgres
    ? yield* sql<{ readonly name: string }>`
        SELECT column_name AS name
        FROM information_schema.columns
        WHERE table_name = 'auth_sessions'
      `
    : yield* sql<{ readonly name: string }>`
        PRAGMA table_info(auth_sessions)
      `;

  if (!sessionColumns.some((column) => column.name === "last_connected_at")) {
    yield* sql`
      ALTER TABLE auth_sessions
      ADD COLUMN last_connected_at TEXT
    `;
  }
});
