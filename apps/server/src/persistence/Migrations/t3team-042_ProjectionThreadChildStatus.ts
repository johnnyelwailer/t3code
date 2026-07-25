import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/** Dedicated, background-generated child status. It is deliberately not a message/activity. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN child_status TEXT NULL`;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN child_status_updated_at TEXT NULL`;
});
