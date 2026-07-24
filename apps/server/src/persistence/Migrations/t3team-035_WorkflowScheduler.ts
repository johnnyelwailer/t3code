/**
 * Scheduled-workflow durability for the t3team workflow engine (Epic 27 §Persistence).
 *
 * Adds the clock-park view of a suspended run to `workflow_runs` (created in t3team-034):
 *   • `wake_at` (nullable ISO) — the wall-clock instant a `sleeping` run is due. The
 *     scheduler's index: on boot (and as runs park) it queries `status = 'sleeping'` for the
 *     soonest `wake_at`, arms one process timer, and on fire resolves the run's `waitUntil`
 *     correlation. Null for any run not parked on a timer.
 *
 * The `sleeping` status value itself lives in the SDK/repo status enum (no DB constraint —
 * `status` is a free TEXT column), so no schema change is needed for it. A partial index over
 * sleeping runs keeps the scheduler's deadline scan cheap as the sidebar fills with routines.
 *
 * Single-instance only — no distributed lease (Epic 27 §Open question 4).
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`ALTER TABLE workflow_runs ADD COLUMN wake_at TEXT`;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_wake_at
    ON workflow_runs(wake_at)
    WHERE status = 'sleeping'
  `;
});
