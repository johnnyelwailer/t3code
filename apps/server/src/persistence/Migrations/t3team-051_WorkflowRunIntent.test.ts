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
interface IntentRow {
  readonly intent_json: string | null;
}

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3team-051_WorkflowRunIntent", (it) => {
  it.effect("adds a nullable intent_json TEXT column to workflow_runs", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      const columns = yield* sql<ColumnRow>`PRAGMA table_info(workflow_runs)`;
      const column = columns.find((candidate) => candidate.name === "intent_json");
      assert.ok(column, "workflow_runs.intent_json column exists");
      assert.strictEqual(column!.notnull, 0);
      assert.strictEqual(column!.dflt_value, null);

      // A row inserted without the column (pre-051 writer shape) reads back NULL, not a crash.
      yield* sql`
        INSERT INTO workflow_runs (
          run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
          model_json, runtime_mode, interaction_mode, status,
          pending_thread_id, pending_correlation_id, pending_kind, wake_at,
          created_at, updated_at
        )
        VALUES (
          'run-legacy-051', '/w/flow.workflow.ts', '{}', 'hash', NULL, 'proj-1',
          '{}', 'full-access', 'default', 'completed',
          NULL, NULL, NULL, NULL,
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        )
      `;
      const rows = yield* sql<IntentRow>`
        SELECT intent_json FROM workflow_runs WHERE run_id = 'run-legacy-051'
      `;
      assert.strictEqual(rows[0]?.intent_json, null);
    }),
  );
});
