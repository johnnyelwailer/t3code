// t3team: this fork already occupies upstream's migration ids, so 039/040 are registered as
// 53/54 (see Migrations.ts). The ids below track that, not upstream's numbering.
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("040_ProjectionProjectFaviconPath", (it) => {
  it.effect("adds the nullable favicon path to project projections", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 53 });
      yield* runMigrations({ toMigrationInclusive: 54 });

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_projects)
      `;
      const faviconPath = columns.find((column) => column.name === "favicon_path");

      assert.equal(faviconPath?.name, "favicon_path");
      assert.equal(faviconPath?.notnull, 0);
    }),
  );
});
