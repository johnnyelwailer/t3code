import * as SqlClient from "effect/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Cloud placements of delegated children (ledger id 117): written once by delegate_task when it
 * places a child on a cloud session (`t3team-cloudChildPlacementMarkers.ts`), read when the
 * `remoteEnvironment` driver re-establishes a child after a server restart. Nothing else writes it;
 * a row is never updated.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_cloud_child_placements (
      child_thread_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      repository_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
});
