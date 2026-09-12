import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";

/**
 * t3team-057 (id 70) drops `thread_task_records` (created by t3team-056, id
 * 69). The task journal was replaced by provider-native plan events
 * (`turn.plan.updated`), so the store had no remaining consumer. The data
 * move itself is NOT a migration: `apps/server/scripts/t3team-replay-task-records-to-
 * plans.ts` re-records live threads' lists through the orchestration engine
 * BEFORE a build containing this migration is started. The test applies
 * through 69 (table created) and checks that 70 removes it, with and without
 * data.
 */
const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("t3team-057 drop migration", (it) => {
  it.effect("drops the table even when it holds data", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 69 });
      yield* sql`
        INSERT INTO thread_task_records (
          id, thread_id, position, subject, active_form, status, note, created_at, updated_at
        ) VALUES
          ('a1', 'thread-1', 1, 'Alpha', NULL, 'pending', NULL,
            '2026-09-12T00:00:00.000Z', '2026-09-12T00:00:00.000Z'),
          ('a2', 'thread-1', 2, 'Beta', NULL, 'in_progress', NULL,
            '2026-09-12T00:00:00.000Z', '2026-09-12T00:00:00.000Z')
      `;

      const executed = yield* runMigrations();
      assert.deepStrictEqual(executed.map(([id]) => id), [70]);

      const tables = yield* sql<{ readonly name: string | null }>`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'thread_task_records'
      `;
      assert.deepStrictEqual(tables, [], "thread_task_records is dropped");
    }),
  );
});

// A second, separate layer block: the in-memory DB is shared across tests of
// one block, and the test above already applied 70 to it.
const noDataLayer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

noDataLayer("t3team-057 on a table without data", (it) => {
  it.effect("drops the table created on a fresh database", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 69 });
      const executed = yield* runMigrations();
      assert.deepStrictEqual(executed.map(([id]) => id), [70]);
      const tables = yield* sql<{ readonly name: string | null }>`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'thread_task_records'
      `;
      assert.deepStrictEqual(tables, []);
    }),
  );
});
