import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3work-042_ProjectionThreadChildStatus", (it) => {
  it.effect("adds dedicated nullable child status columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_threads)
      `;
      for (const name of ["child_status", "child_status_updated_at"]) {
        const column = columns.find((candidate) => candidate.name === name);
        assert.ok(column, `${name} exists`);
        assert.strictEqual(column!.notnull, 0);
      }
    }),
  );
});
