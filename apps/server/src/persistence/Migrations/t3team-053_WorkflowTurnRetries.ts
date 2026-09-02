/**
 * Workflow run interrupted-turn re-drive budget (host-restart step recovery).
 *
 * Adds one NOT NULL column to `workflow_runs`:
 *
 *   • `turn_retries` — how many times the host has already RE-DRIVEN this run's interrupted
 *     `thread.turn` step. When a durable run is suspended on a `thread.turn` ask whose provider
 *     turn died with the host (a desktop restart/kill mid agent-step), the boot settle finds no
 *     reply text; the host re-drives the SAME step (same correlation id, the same prompt message
 *     through the existing `thread.turn.resume` command) with backoff, up to 3 attempts, and
 *     only then fails the run. The counter lives HERE, on the run row, not in the in-memory
 *     registry, so a SECOND restart does not hand the step a fresh budget: rehydration seeds the
 *     restored pending ask with the row's value (t3team-workflowEngineRehydrate.ts).
 *
 * Why a column rather than a journal read-back: the journal records primitive CALLS and their
 * recorded results (fixed wire shapes, keyed per primitive), and a re-drive is HOST bookkeeping
 * — no new entry type may join the closed journal/event contract. A counter written at
 * re-drive time is the one place it can be read back at the next settle, O(1), across restarts.
 *
 * 0 for every pre-053 row (and every run that never had a step re-driven) — the safe reading:
 * a restored run with no recorded retries gets the full 3-attempt budget.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE workflow_runs
    ADD COLUMN turn_retries INTEGER NOT NULL DEFAULT 0
  `;
});
