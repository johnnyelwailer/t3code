import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

interface ColumnRow {
  readonly name: string;
  readonly pk: number;
}
interface IndexRow {
  readonly name: string;
}
interface TableRow {
  readonly name: string;
}

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3work-034_WorkflowDurability", (it) => {
  it.effect("creates workflow_journal + workflow_runs cleanly without disturbing projections", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Apply every migration on a fresh DB, ending with 32.
      yield* runMigrations();

      const journalColumns = yield* sql<ColumnRow>`PRAGMA table_info(workflow_journal)`;
      assert.deepStrictEqual(journalColumns.map((c) => c.name).sort(), [
        "correlation_id",
        "entry_json",
        "phase",
        "run_id",
        "seq",
      ]);
      // Composite primary key (run_id, seq, phase) — `pk` is the 1-based position within the PK.
      assert.deepStrictEqual(
        journalColumns
          .filter((c) => c.pk > 0)
          .sort((a, b) => a.pk - b.pk)
          .map((c) => c.name),
        ["run_id", "seq", "phase"],
      );
      const journalIndexes = yield* sql<IndexRow>`PRAGMA index_list(workflow_journal)`;
      assert.ok(journalIndexes.some((i) => i.name === "idx_workflow_journal_run"));

      const runColumns = yield* sql<ColumnRow>`PRAGMA table_info(workflow_runs)`;
      assert.deepStrictEqual(runColumns.map((c) => c.name).sort(), [
        "args_hash",
        "args_json",
        "created_at",
        "interaction_mode",
        "launch_thread_id",
        "model_json",
        "pending_correlation_id",
        "pending_kind",
        "pending_thread_id",
        "project_id",
        "run_id",
        "runtime_mode",
        "status",
        "updated_at",
        "wake_at", // added by t3work-035 (Epic 27 scheduler)
        "workflow_path",
      ]);
      assert.deepStrictEqual(
        runColumns.filter((c) => c.pk > 0).map((c) => c.name),
        ["run_id"],
      );
      const runIndexes = yield* sql<IndexRow>`PRAGMA index_list(workflow_runs)`;
      assert.ok(runIndexes.some((i) => i.name === "idx_workflow_runs_status"));
      // t3work-035 adds the scheduler's partial index over sleeping runs' wake_at.
      assert.ok(runIndexes.some((i) => i.name === "idx_workflow_runs_wake_at"));

      // Existing projections are unaffected by the new migration.
      const tables = yield* sql<TableRow>`SELECT name FROM sqlite_master WHERE type = 'table'`;
      const tableNames = new Set(tables.map((t) => t.name));
      assert.ok(tableNames.has("projection_projects"));
      assert.ok(tableNames.has("projection_threads"));
    }),
  );
});
