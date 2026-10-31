import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import {
  FIRST_V2_MIGRATION_ID,
  UPSTREAM_V2_MIGRATION_IDS,
  migrationManifest,
  runMigrations,
} from "./Migrations.ts";

// Fork: upstream's V2 ids (55+) are registered at 84+ in this fork's ledger, so the upstream
// tests below are expressed relative to FIRST_V2_MIGRATION_ID instead of literal 54/55/56.
const V2 = FIRST_V2_MIGRATION_ID;
const LAST_PRE_V2 = V2 - 1;
const nameAt = (id: number) => migrationManifest.find(([entryId]) => entryId === id)![1];
const nextIdAfter = (id: number) => migrationManifest.find(([entryId]) => entryId > id)![0];
const V2_SECOND = nextIdAfter(V2);
const V2_THIRD = nextIdAfter(V2_SECOND);
const v2Migrations = migrationManifest.filter(([id]) => id >= V2);
// Only upstream-owned ids are guarded; fork-owned ids (e.g. 99, the repair for ledger gaps) are not.
const upstreamV2Migrations = v2Migrations.filter(([id]) => UPSTREAM_V2_MIGRATION_IDS.has(id));
const FORK_OWNED_IDS = [97, 99, 100, 101, 102, 105, 106];
const newerMigrationId = Math.max(...migrationManifest.map(([id]) => id)) + 1;

const history = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly migration_id: number; readonly name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
  `;
  return rows.map((row) => [row.migration_id, row.name] as const);
});

const v2TableCount = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'orchestration_v2_%'
  `;
  return rows.length;
});

describe("runMigrations", () => {
  it.effect("refuses to start when another migration took a V2 id", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: LAST_PRE_V2 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${V2}, 'FutureMainMigration')
      `;
      const before = yield* history;

      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: LAST_PRE_V2 }), []);
      const exit = yield* Effect.exit(runMigrations());

      assert.isTrue(Exit.isFailure(exit));
      assert.include(String(exit), `${V2}_OrchestrationV2 (recorded: FutureMainMigration)`);
      assert.deepStrictEqual(yield* history, before);
      assert.strictEqual(yield* v2TableCount, 0);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("refuses to start when a later id would skip V2 migrations", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: LAST_PRE_V2 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (${newerMigrationId}, 'FutureMainMigration')
      `;
      const before = yield* history;

      const exit = yield* Effect.exit(runMigrations());

      assert.isTrue(Exit.isFailure(exit));
      for (const [id, name] of upstreamV2Migrations) {
        assert.include(String(exit), `${id}_${name} (recorded: nothing)`);
      }
      assert.deepStrictEqual(yield* history, before);
      assert.strictEqual(yield* v2TableCount, 0);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("upgrades a database at exactly the last pre-V2 id", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: LAST_PRE_V2 });
      assert.deepStrictEqual(yield* runMigrations(), v2Migrations);
      assert.deepStrictEqual(yield* history, migrationManifest);
      assert.isAbove(yield* v2TableCount, 0);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect.each([30, LAST_PRE_V2])("still starts with a site-local migration at id %s", (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: LAST_PRE_V2 });
      yield* sql`
        UPDATE effect_sql_migrations SET name = 'SiteLocalMigration' WHERE migration_id = ${id}
      `;

      assert.deepStrictEqual(yield* runMigrations(), v2Migrations);
      assert.isAbove(yield* v2TableCount, 0);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("only checks V2 migrations within the requested limit", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: V2 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (${V2_SECOND}, 'SiteLocalMigration'), (${newerMigrationId}, 'NewerV2Migration')
      `;
      const before = yield* history;

      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: V2 }), []);
      const exit = yield* Effect.exit(runMigrations({ toMigrationInclusive: V2_SECOND }));
      assert.isTrue(Exit.isFailure(exit));
      assert.include(
        String(exit),
        `${V2_SECOND}_${nameAt(V2_SECOND)} (recorded: SiteLocalMigration)`,
      );
      assert.notInclude(String(exit), `${V2_THIRD}_${nameAt(V2_THIRD)}`);
      assert.notInclude(String(exit), "103_ScheduledTaskWebhooks");
      assert.deepStrictEqual(yield* history, before);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("still starts when a fork-owned migration is missing from the ledger", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      for (const id of FORK_OWNED_IDS) {
        assert.isTrue(migrationManifest.some(([entryId]) => entryId === id));
        assert.isFalse(UPSTREAM_V2_MIGRATION_IDS.has(id));
      }
      yield* sql`
        DELETE FROM effect_sql_migrations WHERE migration_id IN (97, 99, 100, 101, 102, 105, 106)
      `;

      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("guards exactly the upstream-owned ids of the manifest", () =>
    Effect.sync(() => {
      assert.deepStrictEqual(
        [...UPSTREAM_V2_MIGRATION_IDS].toSorted((a, b) => a - b),
        [
          84, 85, 103, 104, 107, 108, 109, 110, 112, 113, 114, 115, 118, 119, 120, 121, 122, 123,
          124, 125, 126,
        ],
      );
    }),
  );

  it.effect("still starts after a newer build recorded a later V2 migration", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (${newerMigrationId}, 'NewerV2Migration')
      `;

      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});

// Upstream's version of this test compares the `NNN_Name.ts` files to the manifest one to one,
// because the npm launcher reads its highest migration id from those file names. That cannot hold
// here: the manifest also carries fork-owned `t3team-NNN_Name.ts` entries, and upstream's 055+
// are registered at other ids (see `UPSTREAM_V2_MIGRATION_IDS`). What is still true, and what
// keeps an upstream migration from being merged in but never run, is that every upstream file is
// registered under its own name at some id. Upstream 063 is held on purpose (it drops
// `projection_thread_activities`, which the fork's V1 lineage cutover still reads); it is
// listed here so that registering it later shows up as a change to this test.
const HELD_UPSTREAM_MIGRATIONS = ["DropUnusedV1Projections"];

it.effect("registers every upstream migration file at some id, except the held ones", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(import.meta.dirname, "Migrations");
    const upstreamFileNames = (yield* fs.readDirectory(dir)).flatMap((name) => {
      const match = /^(\d+)_(\w+)\.ts$/.exec(name);
      return match?.[2] === undefined ? [] : [match[2]];
    });
    assert.isAbove(upstreamFileNames.length, 0);
    const registeredNames = new Set<string>(migrationManifest.map(([, name]) => name));
    assert.deepStrictEqual(
      upstreamFileNames.filter((name) => !registeredNames.has(name)).toSorted(),
      HELD_UPSTREAM_MIGRATIONS,
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);
