/**
 * Workflow run origin (ephemeral workflows, slice 1).
 *
 * Adds `origin` to `workflow_runs` so agent-authored ephemeral runs (launched by the
 * `t3work.orchestration.run` tool, no recipe on disk) are distinguishable from recipe-launched runs.
 * Existing rows and every recipe launch default to 'recipe'; the ephemeral tool path writes
 * 'ephemeral'. Boot rehydration is origin-agnostic — it restores both kinds unchanged.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE workflow_runs
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'recipe'
  `;
});
