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
interface RetriesRow {
  readonly turn_retries: number;
}

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3team-053_WorkflowTurnRetries", (it) => {
  it.effect("adds NOT NULL DEFAULT 0 turn_retries INTEGER to workflow_runs", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      const columns = yield* sql<ColumnRow>`PRAGMA table_info(workflow_runs)`;
      const column = columns.find((candidate) => candidate.name === "turn_retries");
      assert.ok(column, "workflow_runs.turn_retries column exists");
      assert.strictEqual(column!.notnull, 1);
      assert.strictEqual(column!.dflt_value, "0");

      // A row inserted without the column (pre-053 writer shape) reads back 0 — the safe
      // reading: a restored run with no recorded retries gets the full re-drive budget.
      yield* sql`
        INSERT INTO workflow_runs (
          run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
          model_json, runtime_mode, interaction_mode, status,
          pending_thread_id, pending_correlation_id, pending_kind, wake_at,
          created_at, updated_at
        )
        VALUES (
          'run-legacy-053', '/w/flow.workflow.ts', '{}', 'hash', NULL, 'proj-1',
          '{}', 'full-access', 'default', 'suspended',
          'thread-1', 'run-legacy-053:1', 'thread.turn', NULL,
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        )
      `;
      const rows = yield* sql<RetriesRow>`
        SELECT turn_retries FROM workflow_runs WHERE run_id = 'run-legacy-053'
      `;
      assert.strictEqual(rows[0]?.turn_retries, 0);
    }),
  );
});
