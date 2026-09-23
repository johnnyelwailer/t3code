import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

interface IndexRow {
  readonly name: string;
}

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const indexExists = Effect.fn("test.indexExists")(function* (name: string) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<IndexRow>`
    SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${name}
  `;
  return rows.length;
});

layer("t3team-060_EnsureProjectionThreadActivitiesKindIndex", (it) => {
  it.effect("creates the kind index on a fresh database", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      assert.strictEqual(
        yield* indexExists("idx_projection_thread_activities_kind_created"),
        1,
        "kind index exists after a full migration run",
      );
    }),
  );

  it.effect("repairs a ledger where the index was silently never created", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Simulate the broken live ledger: every migration up to just before
      // this one has run, but the kind index is missing (its original id was
      // consumed by a different migration on that machine).
      yield* runMigrations({ toMigrationInclusive: 77 });
      yield* sql`DROP INDEX idx_projection_thread_activities_kind_created`;
      // The group's layer may be shared across tests, in which case test 1
      // already applied this migration: force the ledger back to the
      // broken state (the repair migration never ran on this machine).
      yield* sql`
        DELETE FROM effect_sql_migrations
        WHERE name = 'EnsureProjectionThreadActivitiesKindIndex'
      `;
      assert.strictEqual(
        yield* indexExists("idx_projection_thread_activities_kind_created"),
        0,
        "index is absent before the repair migration",
      );

      // The tail migration must recreate it even though the rest of the
      // ledger is already satisfied.
      yield* runMigrations();

      assert.strictEqual(
        yield* indexExists("idx_projection_thread_activities_kind_created"),
        1,
        "kind index is re-created by the tail repair migration",
      );

      // Idempotency: a second run must not fail or duplicate the index.
      yield* runMigrations();
      assert.strictEqual(
        yield* indexExists("idx_projection_thread_activities_kind_created"),
        1,
        "index count is unchanged after a second run",
      );
    }),
  );
});
