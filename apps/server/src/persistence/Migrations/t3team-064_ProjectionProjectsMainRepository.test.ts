// Registered as migration 84 (see Migrations.ts).
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import ProjectionProjectsMainRepository from "./t3team-064_ProjectionProjectsMainRepository.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));

layer("t3team-064_ProjectionProjectsMainRepository", (it) => {
  it.effect("adds a nullable main repository column, idempotently", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 84 });
      // A ledger that already applied the column under another id must not fail on re-run.
      yield* ProjectionProjectsMainRepository;

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_projects)
      `;
      const mainRepository = columns.filter((column) => column.name === "main_repository_json");
      assert.equal(mainRepository.length, 1);
      assert.equal(mainRepository[0]?.notnull, 0);
    }),
  );
});
