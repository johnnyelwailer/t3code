import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Execution-environment binding for threads (t3team start_child `environment`):
 * the EnvironmentId + label of the environment the thread's child session is
 * bound to. NULL = same environment as the hosting server (the default, and
 * the state of every pre-existing row).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN environment_json TEXT NULL`;
});
