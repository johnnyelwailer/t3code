import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/** Live LLM-generated activity label for active threads (GHE #40). Ephemeral UI state, cleared on idle. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN activity_label TEXT NULL`;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN activity_label_updated_at TEXT NULL`;
});
