/**
 * Workflow run recipe path (Epic 25 §Scripts — rehydration gap).
 *
 * Adds nullable `recipe_path` to `workflow_runs`: the launching recipe's directory for a
 * recipe-launched run, NULL for ephemeral (or pre-043) runs. Recipe-private scripts are
 * re-materialized from the recipe module at launch (`resolveRecipeWorkflowScripts`); without
 * the recipe path persisted, boot rehydration rebuilt suspended runs with an empty `scripts.*`
 * tree and any post-restart `scripts.*` call failed. Rehydration now re-resolves the scripts
 * from this column.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE workflow_runs
    ADD COLUMN recipe_path TEXT
  `;
});
