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

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3team-050_ProjectionThreadActivityState", (it) => {
  it.effect("adds the nullable activity-state columns to projection_threads", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();

      const columns = yield* sql<ColumnRow>`PRAGMA table_info(projection_threads)`;
      const state = columns.find((column) => column.name === "activity_state");
      assert.isNotNull(state);
      assert.strictEqual(state!.notnull, 0);
      const stateUpdatedAt = columns.find((column) => column.name === "activity_state_updated_at");
      assert.isNotNull(stateUpdatedAt);
      assert.strictEqual(stateUpdatedAt!.notnull, 0);
    }),
  );
});
