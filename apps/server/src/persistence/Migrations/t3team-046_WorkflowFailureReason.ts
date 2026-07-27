/**
 * Workflow run failure reason (orchestration observability).
 *
 * Adds two nullable columns to `workflow_runs`, written by the ONE terminal-failure funnel
 * (`settleWorkflowRunFailure`) and cleared by every non-failing settle:
 *
 *   • `failure_reason` — the agent-facing, readable reason the run failed (sanitized: no stack
 *     frames, no absolute paths).
 *   • `failure_step`   — the step/phase it failed in (`<phase>` plus the primitive in flight),
 *     so an agent can act on WHERE it broke, not just that it broke.
 *
 * Why a column rather than a journal read-back: the journal records primitive CALLS and their
 * recorded results — a thrown body error is never a journal entry, so a read-back can only ever
 * report the last successful position, not the cause. The reason has to be written at settle
 * time to exist at all; once it is written, a column also makes `status`/`resume` O(1) instead
 * of parsing a journal per query. NULL for a run that never failed (or any pre-046 row).
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE workflow_runs
    ADD COLUMN failure_reason TEXT
  `;
  yield* sql`
    ALTER TABLE workflow_runs
    ADD COLUMN failure_step TEXT
  `;
});
