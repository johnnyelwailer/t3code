/**
 * Workflow run intent (auto-report prerequisite — Epic 25 §Auto-report on completion).
 *
 * `intent` ({goal, expectedOutcome, guardrails}) is REQUIRED at launch by
 * `t3team.orchestration.run` and was then discarded: `workflow_runs` had no column for it, and
 * its only consumer was `repairIntent` on the self-heal path
 * (`t3team-workflowEphemeralLaunch.ts`). A run that fails self-heals against it; a run that
 * SUCCEEDS forgets what it was asked to do.
 *
 * That is exactly the judgement a report needs. Without a stored `expectedOutcome` a reporter can
 * say what happened but never whether the run achieved what it set out to — and "did this meet its
 * expected outcome" is what decides whether a human has to get involved.
 *
 * One nullable JSON column rather than three scalar ones: the value is written and read as one
 * whole contract, never queried by field, and a single column keeps the shape versionable with the
 * SDK schema it comes from (`WorkflowRunIntent`). NULL for a recipe launch that carries no intent,
 * and for every pre-051 row.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE workflow_runs
    ADD COLUMN intent_json TEXT
  `;
});
