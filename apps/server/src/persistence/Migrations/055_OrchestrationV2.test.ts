import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { migrationEntries, runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));

layer("055_OrchestrationV2", (it) => {
  it.effect("keeps released migrations contiguous", () =>
    Effect.sync(() => {
      // t3team: the fork ledger keeps its own ids 1..83 and places upstream 055/056 at 84/85.
      // Fork migrations from 86 are allocated in reserved blocks, so later ids may skip; they
      // must still be unique and strictly increasing.
      const ids = migrationEntries.map(([id]) => id);
      assert.deepStrictEqual(
        ids.filter((id) => id <= 85),
        Array.from({ length: 85 }, (_, index) => index + 1),
      );
      assert.ok(ids.every((id, index) => index === 0 || id > ids[index - 1]!));
    }),
  );

  // t3team: upstream's released 53 (PullRequestFilesViewed) is fork ledger id 80, and upstream
  // 054/055/056 are fork 81/84/85 (fork 82/83 and every fork migration from 86 interleave).
  it.effect("upgrades released schema 53 through the latest migrations", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 80 });

      const executed = yield* runMigrations();
      assert.deepStrictEqual(
        executed,
        migrationEntries.filter(([id]) => id > 80).map(([id, name]) => [id, name]),
      );
      assert.deepStrictEqual(
        executed.filter(([id]) => id <= 85),
        [
          [81, "ProjectionThreadsAutoSettleDisabledAt"],
          [82, "ProjectionThreadShellT3TeamFacts"],
          [83, "OrchestrationEventsTypeSequenceIndex"],
          [84, "OrchestrationV2"],
          [85, "RemoveRedundantProjectionIndexes"],
        ],
      );
      assert.deepStrictEqual(yield* runMigrations(), []);

      const migrations = yield* sql<{
        readonly migration_id: number;
        readonly name: string;
      }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
        WHERE migration_id >= 80 AND migration_id <= 85
        ORDER BY migration_id
      `;
      assert.deepStrictEqual(migrations, [
        { migration_id: 80, name: "PullRequestFilesViewed" },
        { migration_id: 81, name: "ProjectionThreadsAutoSettleDisabledAt" },
        { migration_id: 82, name: "ProjectionThreadShellT3TeamFacts" },
        { migration_id: 83, name: "OrchestrationEventsTypeSequenceIndex" },
        { migration_id: 84, name: "OrchestrationV2" },
        { migration_id: 85, name: "RemoveRedundantProjectionIndexes" },
      ]);

      const tables = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'orchestration_v2_projection_threads',
            'orchestration_v2_projection_subagents',
            'orchestration_v2_effect_outbox',
            'orchestration_v2_turn_item_positions',
            'orchestration_v2_projection_metadata',
            'orchestration_v2_projection_provider_session_bindings',
            'orchestration_v2_thread_launch_workflows',
            'orchestration_v2_legacy_imports',
            'scheduled_tasks'
          )
        ORDER BY name
      `;
      assert.deepStrictEqual(
        tables.map(({ name }) => name),
        [
          "orchestration_v2_effect_outbox",
          "orchestration_v2_legacy_imports",
          "orchestration_v2_projection_metadata",
          "orchestration_v2_projection_provider_session_bindings",
          "orchestration_v2_projection_subagents",
          "orchestration_v2_projection_threads",
          "orchestration_v2_thread_launch_workflows",
          "orchestration_v2_turn_item_positions",
          "scheduled_tasks",
        ],
      );

      const eventColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(orchestration_events)
      `;
      const receiptColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(orchestration_command_receipts)
      `;
      const threadColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(orchestration_v2_projection_threads)
      `;
      const subagentColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(orchestration_v2_projection_subagents)
      `;
      assert.ok(eventColumns.some(({ name }) => name === "application_event_version"));
      assert.ok(receiptColumns.some(({ name }) => name === "command_type"));
      assert.ok(threadColumns.some(({ name }) => name === "provider_instance_id"));
      assert.ok(subagentColumns.some(({ name }) => name === "driver"));
      assert.ok(subagentColumns.some(({ name }) => name === "provider_instance_id"));

      const indexes = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'index'
          AND name IN (
            'idx_orchestration_events_application_high_water',
            'orchestration_events_v2_created_threads_idx',
            'orchestration_v2_projection_turn_items_shell_pending_idx'
          )
        ORDER BY name
      `;
      assert.deepStrictEqual(
        indexes.map(({ name }) => name),
        [
          "idx_orchestration_events_application_high_water",
          "orchestration_events_v2_created_threads_idx",
          "orchestration_v2_projection_turn_items_shell_pending_idx",
        ],
      );
    }),
  );
});
