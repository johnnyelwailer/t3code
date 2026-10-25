import * as SqlClient from "effect/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Recipe-trigger launch ledger (ledger id 116). A trigger's claim consumes its key's inbox slots
 * and writes one row here in the SAME transaction, so a claimed event can no longer be lost
 * between the claim and the launch: a crash or a failed launch leaves a `pending` row the runner
 * retries. `launch_id` doubles as the run id the launch uses, which is what makes a retry after a
 * crash idempotent (a run row that already exists means the launch happened). The trigger limits
 * (per-key interval, daily cap, in-flight count) are derived from these rows, so they survive a
 * restart.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS workflow_signal_trigger_launches (
      launch_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      recipe_id TEXT NOT NULL,
      trigger_id TEXT NOT NULL,
      trigger_key TEXT NOT NULL,
      source_name TEXT NOT NULL,
      params_hash TEXT NOT NULL,
      signal_name TEXT NOT NULL,
      args_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      claimed_at TEXT NOT NULL,
      next_attempt_at TEXT NOT NULL,
      launched_at TEXT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_signal_trigger_launches_recipe
    ON workflow_signal_trigger_launches(recipe_id, claimed_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_signal_trigger_launches_pending
    ON workflow_signal_trigger_launches(next_attempt_at)
    WHERE status = 'pending'
  `;
});
