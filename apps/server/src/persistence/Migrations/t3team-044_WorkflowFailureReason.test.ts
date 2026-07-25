import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

interface ColumnRow {
  readonly name: string;
  readonly dflt_value: string | null;
  readonly notnull: number;
}
interface FailureRow {
  readonly failure_reason: string | null;
  readonly failure_step: string | null;
}

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3team-044_WorkflowFailureReason", (it) => {
  it.effect("adds nullable failure_reason + failure_step TEXT to workflow_runs", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      const columns = yield* sql<ColumnRow>`PRAGMA table_info(workflow_runs)`;
      for (const name of ["failure_reason", "failure_step"]) {
        const column = columns.find((candidate) => candidate.name === name);
        assert.ok(column, `workflow_runs.${name} column exists`);
        assert.strictEqual(column!.notnull, 0);
        assert.strictEqual(column!.dflt_value, null);
      }

      // A row inserted without the failure columns (pre-044 writer shape) reads back NULL.
      yield* sql`
        INSERT INTO workflow_runs (
          run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
          model_json, runtime_mode, interaction_mode, status,
          pending_thread_id, pending_correlation_id, pending_kind, wake_at,
          created_at, updated_at
        )
        VALUES (
          'run-legacy-044', '/w/flow.workflow.ts', '{}', 'hash', NULL, 'proj-1',
          '{}', 'full-access', 'default', 'failed',
          NULL, NULL, NULL, NULL,
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        )
      `;
      const rows = yield* sql<FailureRow>`
        SELECT failure_reason, failure_step FROM workflow_runs WHERE run_id = 'run-legacy-044'
      `;
      assert.strictEqual(rows[0]?.failure_reason, null);
      assert.strictEqual(rows[0]?.failure_step, null);
    }),
  );
});
