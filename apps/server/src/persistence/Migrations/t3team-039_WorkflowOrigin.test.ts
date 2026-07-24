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
interface OriginRow {
  readonly origin: string;
}

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3team-039_WorkflowOrigin", (it) => {
  it.effect("adds origin TEXT NOT NULL DEFAULT 'recipe' to workflow_runs", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      const columns = yield* sql<ColumnRow>`PRAGMA table_info(workflow_runs)`;
      const origin = columns.find((column) => column.name === "origin");
      assert.ok(origin, "workflow_runs.origin column exists");
      assert.strictEqual(origin!.notnull, 1);
      assert.strictEqual(origin!.dflt_value, "'recipe'");

      // A row inserted without origin (pre-039 writer shape) defaults to 'recipe'.
      yield* sql`
        INSERT INTO workflow_runs (
          run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
          model_json, runtime_mode, interaction_mode, status,
          pending_thread_id, pending_correlation_id, pending_kind, wake_at,
          created_at, updated_at
        )
        VALUES (
          'run-legacy', '/w/flow.workflow.ts', '{}', 'hash', NULL, 'proj-1',
          '{}', 'full-access', 'default', 'suspended',
          NULL, NULL, NULL, NULL,
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        )
      `;
      const rows = yield* sql<OriginRow>`
        SELECT origin FROM workflow_runs WHERE run_id = 'run-legacy'
      `;
      assert.strictEqual(rows[0]?.origin, "recipe");
    }),
  );
});
