// Upgrade gate: every database shape a released fork build has written must migrate with the
// current manifest. A sync PR that breaks an old install fails here instead of on a user's Mac
// (2026-10-14: upstream's V2 guard refused every pre-sync fork install at id 60).
//
// Fixtures in __fixtures__/t3team-fork-release-*.fixtures.json hold schema DDL + migration ledger only (no rows),
// produced by scripts/t3team-dump-migration-upgrade-fixture.mjs from a database written by the previous
// pinned fork core. Add a new fixture (and register it below) whenever a fork release is pinned.
import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { FIRST_V2_MIGRATION_ID, migrationManifest, runMigrations } from "./Migrations.ts";
import forkReleaseA6a84edab4 from "./__fixtures__/t3team-fork-release-a6a84edab4.fixtures.json" with { type: "json" };

interface UpgradeFixture {
  readonly label: string;
  readonly statements: ReadonlyArray<string>;
  readonly ledger: ReadonlyArray<readonly [number, string]>;
}

// Register each committed previous-release fixture here (one per pinned fork release).
const fixtures: ReadonlyArray<readonly [string, UpgradeFixture]> = [
  ["a6a84edab4", forkReleaseA6a84edab4 as unknown as UpgradeFixture],
];

const ledger = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly migration_id: number; readonly name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
  `;
  return new Map(rows.map((row) => [row.migration_id, row.name]));
});

const loadFixture = (fixture: UpgradeFixture) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    for (const statement of fixture.statements) {
      yield* sql.unsafe(statement);
    }
    for (const [id, name] of fixture.ledger) {
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
    }
  });

const assertReadable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`SELECT * FROM projection_projects LIMIT 1`;
  yield* sql`SELECT * FROM projection_threads LIMIT 1`;
  yield* sql`SELECT * FROM orchestration_v2_events LIMIT 1`;
});

const preSyncMaxId = 108; // highest id on fork main before the 2026-10-13 upstream sync

describe("migration upgrade gate", () => {
  it("has at least one previous-release fixture", () => {
    assert.isAbove(fixtures.length, 0);
  });

  it.effect.each(fixtures)(
    "upgrades a database written by previous fork release %s",
    ([, fixture]) =>
      Effect.gen(function* () {
        yield* loadFixture(fixture);
        const recordedMax = Math.max(...fixture.ledger.map(([id]) => id));
        const ran = yield* runMigrations();
        assert.deepStrictEqual(
          ran.map(([id]) => id),
          migrationManifest.filter(([id]) => id > recordedMax).map(([id]) => id),
        );
        const after = yield* ledger;
        for (const [id] of migrationManifest) assert.isTrue(after.has(id), `missing ${id}`);
        yield* assertReadable;
        // Idempotent restart.
        assert.deepStrictEqual(yield* runMigrations(), []);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("upgrades a pre-sync fork database with the GHE #382 id-60 ledger collision", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: preSyncMaxId });
      // Production fork installs recorded 60 as ProjectionThreadsUnsettledAt; 78 re-ensures the
      // kind index that 60 should have created.
      yield* sql`UPDATE effect_sql_migrations SET name = 'ProjectionThreadsUnsettledAt' WHERE migration_id = 60`;
      const ran = yield* runMigrations();
      assert.deepStrictEqual(
        ran.map(([id]) => id),
        migrationManifest.filter(([id]) => id > preSyncMaxId).map(([id]) => id),
      );
      yield* assertReadable;
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("upgrades a clean pre-sync fork database", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: preSyncMaxId });
      yield* runMigrations();
      assert.strictEqual((yield* ledger).size, migrationManifest.length);
      yield* assertReadable;
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("migrates a fresh database", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      assert.strictEqual((yield* ledger).size, migrationManifest.length);
      yield* assertReadable;
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it("keeps the V2 guard on the fork's ledger id for upstream 055", () => {
    assert.deepStrictEqual(
      migrationManifest.find(([id]) => id === FIRST_V2_MIGRATION_ID),
      [FIRST_V2_MIGRATION_ID, "OrchestrationV2"],
    );
  });
});
