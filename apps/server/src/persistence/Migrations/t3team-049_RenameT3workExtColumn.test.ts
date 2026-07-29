import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

interface ColumnRow {
  readonly name: string;
}
interface ExtRow {
  readonly t3team_ext_json: string | null;
}

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const columnNames = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<ColumnRow>`PRAGMA table_info(projection_thread_messages)`;
  return new Set(columns.map((column) => column.name));
});

layer("t3team-049_RenameT3workExtColumn", (it) => {
  it.effect("renames a pre-rebrand t3work_ext_json column and preserves its data", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // A database migrated before the rebrand: 033 ran under its old name and
      // added `t3work_ext_json`. Replay that exact history — migrate through
      // 032, apply the old column shape by hand, and mark 033 as done in the
      // ledger so the renamed 033 never re-runs (the bug being repaired).
      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN t3work_ext_json TEXT`;
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name, created_at)
        VALUES (33, 'ProjectionThreadMessageT3workExt', '2026-01-01T00:00:00.000Z')
      `;
      yield* sql`
        INSERT INTO projection_thread_messages (
          message_id, thread_id, role, text, is_streaming, created_at, updated_at, t3work_ext_json
        )
        VALUES ('msg-1', 'thread-1', 'assistant', 'hello', 0, '2026-01-01T00:00:00.000Z',
                '2026-01-01T00:00:00.000Z', '{"displayText":"kept"}')
      `;

      yield* runMigrations();

      const names = yield* columnNames;
      assert.isTrue(names.has("t3team_ext_json"));
      assert.isFalse(names.has("t3work_ext_json"));
      const rows = yield* sql<ExtRow>`
        SELECT t3team_ext_json FROM projection_thread_messages WHERE message_id = 'msg-1'
      `;
      assert.strictEqual(rows[0]?.t3team_ext_json, '{"displayText":"kept"}');
    }),
  );

  it.effect("no-ops on a database whose 033 already created t3team_ext_json", () =>
    Effect.gen(function* () {
      yield* runMigrations();

      const names = yield* columnNames;
      assert.isTrue(names.has("t3team_ext_json"));
      assert.isFalse(names.has("t3work_ext_json"));
    }),
  );
});
