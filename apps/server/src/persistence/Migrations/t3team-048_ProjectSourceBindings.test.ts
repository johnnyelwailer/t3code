import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

interface ColumnRow {
  readonly name: string;
  readonly notnull: number;
}
interface BindingRow {
  readonly project_id: string;
  readonly provider: string;
  readonly account_id: string | null;
  readonly external_project_id: string | null;
}
interface ProjectionStateRow {
  readonly last_applied_sequence: number;
}

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3team-048_ProjectSourceBindings", (it) => {
  it.effect("creates the bindings table with the expected columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      const columns = yield* sql<ColumnRow>`PRAGMA table_info(t3team_project_source_bindings)`;
      const columnNames = columns.map((column) => column.name);
      assert.deepStrictEqual(columnNames, [
        "project_id",
        "provider",
        "account_id",
        "external_project_id",
        "external_project_key",
        "external_project_url",
        "updated_at",
      ]);
      const provider = columns.find((column) => column.name === "provider");
      assert.strictEqual(provider!.notnull, 1);
      const accountId = columns.find((column) => column.name === "account_id");
      assert.strictEqual(accountId!.notnull, 0);
    }),
  );

  it.effect("round-trips a bound row and allows a nullable local row", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      yield* sql`
        INSERT INTO t3team_project_source_bindings (
          project_id, provider, account_id, external_project_id, updated_at
        )
        VALUES ('proj-1', 'atlassian', 'acct-1', 'ext-1', '2026-01-01T00:00:00.000Z')
      `;
      yield* sql`
        INSERT INTO t3team_project_source_bindings (
          project_id, provider, account_id, external_project_id, updated_at
        )
        VALUES ('proj-2', 'local', NULL, NULL, '2026-01-01T00:00:00.000Z')
      `;

      const rows = yield* sql<BindingRow>`
        SELECT project_id, provider, account_id, external_project_id
        FROM t3team_project_source_bindings ORDER BY project_id ASC
      `;
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0]?.provider, "atlassian");
      assert.strictEqual(rows[0]?.account_id, "acct-1");
      assert.strictEqual(rows[1]?.provider, "local");
      assert.strictEqual(rows[1]?.account_id, null);
    }),
  );

  it.effect("seeds the projector cursor at the current max event sequence (no replay cost)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      const rows = yield* sql<ProjectionStateRow>`
        SELECT last_applied_sequence FROM projection_state
        WHERE projector = 't3team.projection.project-source-bindings'
      `;
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0]?.last_applied_sequence, 0);
    }),
  );
});
