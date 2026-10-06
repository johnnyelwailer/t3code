import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Drops the fork's provider usage-hold table (t3team-055). Usage-limit pause and
 * auto-resume moved to upstream's `UsageLimitRecoveryWorker` (thread
 * `limitRecovery` metadata), so no code reads or writes these rows any more.
 * Active holds are released by dropping them: the thread's failed usage-limit
 * run is what the upstream worker recovers.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DROP INDEX IF EXISTS idx_provider_usage_holds_active`;
  yield* sql`DROP TABLE IF EXISTS provider_usage_holds`;
});
