import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";

const PORT_TABLES = [
  "t3team_child_thread_metadata",
  "t3team_thread_artifacts",
  "t3team_thread_facts",
  "t3team_thread_mailbox",
  "t3team_thread_mailbox_holds",
  "t3team_thread_silence_watches",
  "t3team_v2_cutover",
];

const portTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 't3team_%' ORDER BY name
  `;
  return rows.map((row) => row.name).filter((name) => PORT_TABLES.includes(name));
});

/**
 * A database booted on an intermediate port build recorded id 97 before 86-92 were
 * registered, so the Migrator skips 86-92 on every later build. Id 99 re-creates
 * their tables.
 */
it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("t3team-077 repair", (it) => {
  it.effect("creates the port tables a ledger that recorded 97 early skipped", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 85 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (97, 'DropProviderUsageHolds')
      `;
      assert.deepStrictEqual(yield* portTables, []);

      const executed = yield* runMigrations();
      // 98 and 99 are the repair; 100+ are later migrations that run on any ledger at 97.
      assert.deepStrictEqual(
        executed.map(([id]) => id),
        [98, 99, 100, 101],
      );
      assert.deepStrictEqual(yield* portTables, PORT_TABLES);
    }),
  );
});

it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })))(
  "t3team-077 on a complete ledger",
  (it) => {
    it.effect("changes nothing where the port tables already exist", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runMigrations({ toMigrationInclusive: 98 });
        yield* sql`
          INSERT INTO t3team_thread_facts (thread_id, facts_json, updated_at)
          VALUES ('thread-1', '{}', '2026-10-01T00:00:00.000Z')
        `;
        yield* runMigrations();
        const rows = yield* sql<{ readonly thread_id: string }>`
          SELECT thread_id FROM t3team_thread_facts
        `;
        assert.deepStrictEqual(
          rows.map((row) => row.thread_id),
          ["thread-1"],
        );
      }),
    );
  },
);
