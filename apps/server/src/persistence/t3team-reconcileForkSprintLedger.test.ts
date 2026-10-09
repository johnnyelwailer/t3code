import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import { migrationManifest, runMigrations } from "./Migrations.ts";
import ThreadFacts from "./Migrations/t3team-064_ThreadFacts.ts";
import ThreadArtifacts from "./Migrations/t3team-065_ThreadArtifacts.ts";
import OrchestrationV2 from "./Migrations/055_OrchestrationV2.ts";
import ChildThreadMetadata from "./Migrations/t3team-068_ChildThreadMetadata.ts";
import MainRepository from "./Migrations/t3team-064_ProjectionProjectsMainRepository.ts";
import FeatureFlags from "./Migrations/t3team-065_FeatureFlags.ts";

// Fork main between b811217104 (2026-10-03) and the V2 merge d8c2ff41d3 (2026-10-05) recorded
// its sprint migrations at 84/85, the ids V2 then took. V2 seeds statev2.sqlite from that ledger.
const seedSprintLedger = Effect.gen(function* () {
  yield* runMigrations({ toMigrationInclusive: 83 });
  yield* Migrator.make({})({
    loader: Migrator.fromRecord({
      "84_ProjectionProjectsMainRepository": MainRepository,
      "85_FeatureFlags": FeatureFlags,
    }),
  });
});

const assertBootedToManifest = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const v2Tables = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orchestration_v2_projection_threads'
  `;
  assert.lengthOf(v2Tables, 1);
  const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
  `;
  assert.deepStrictEqual(
    history.map((row) => [row.migration_id, row.name] as const),
    migrationManifest,
  );
  assert.deepStrictEqual(yield* runMigrations(), []);
});

describe("fork sprint ledger (84/85) upgrade", () => {
  it.effect("boots a database that recorded the sprint migrations at 84/85", () =>
    Effect.gen(function* () {
      yield* seedSprintLedger;
      yield* runMigrations();
      yield* assertBootedToManifest;
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("only relabels a sprint ledger whose V2 schema already exists", () =>
    Effect.gen(function* () {
      yield* seedSprintLedger;
      yield* OrchestrationV2;
      yield* runMigrations();
      yield* assertBootedToManifest;
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("recovers a database whose earlier V2 boot stopped at the missing V2 tables", () =>
    Effect.gen(function* () {
      yield* seedSprintLedger;
      yield* Migrator.make({})({
        loader: Migrator.fromRecord({
          "86_ThreadFacts": ThreadFacts,
          "87_ThreadArtifacts": ThreadArtifacts,
          "90_ChildThreadMetadata": ChildThreadMetadata,
        }),
      });
      yield* runMigrations();
      yield* assertBootedToManifest;
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
