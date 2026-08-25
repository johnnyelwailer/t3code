import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Deterministic 4-state activity state for active threads (GHE #208):
 * thinking / writing / working / waiting. Ephemeral UI state, cleared on idle,
 * derived on the server from the provider runtime stream — never inference.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN activity_state TEXT NULL`;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN activity_state_updated_at TEXT NULL`;
});
