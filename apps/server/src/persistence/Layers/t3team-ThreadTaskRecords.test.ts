import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";
import { ThreadTaskRecordRepository } from "../Services/t3team-ThreadTaskRecords.ts";
import { ThreadTaskRecordRepositoryLive } from "./t3team-ThreadTaskRecords.ts";

const threadId = ThreadId.make("thread-journal-1");
const otherThreadId = ThreadId.make("thread-journal-2");
const at = "2026-09-11T00:00:00.000Z";

const task = (id: string, position: number, subject: string, extra?: Record<string, unknown>) => ({
  id,
  threadId,
  position,
  subject,
  status: "pending" as const,
  createdAt: at,
  updatedAt: at,
  ...extra,
});

const layer = it.layer(
  ThreadTaskRecordRepositoryLive.pipe(Layer.provideMerge(NodeSqliteClient.layerMemory())),
);

layer("ThreadTaskRecordRepository", (it) => {
  it.effect("lists an empty journal for a thread that never wrote one", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* ThreadTaskRecordRepository;
      const tasks = yield* repository.listForThread({ threadId });
      assert.deepStrictEqual(tasks, []);
    }),
  );

  it.effect("replaces the whole journal and reads it back in position order", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* ThreadTaskRecordRepository;

      yield* repository.replaceForThread({
        threadId,
        tasks: [
          task("a", 1, "First", { activeForm: "Doing first", note: "why it stalled" }),
          task("b", 2, "Second"),
          task("c", 3, "Third"),
        ],
      });
      const first = yield* repository.listForThread({ threadId });
      assert.deepStrictEqual(
        first.map((row) => [row.position, row.subject]),
        [
          [1, "First"],
          [2, "Second"],
          [3, "Third"],
        ],
      );
      assert.strictEqual(first[0]?.activeForm, "Doing first");
      assert.strictEqual(first[0]?.note, "why it stalled");
      // NULL columns come back as absent optional fields, not as `null`.
      assert.strictEqual(first[1]?.activeForm, undefined);
      assert.strictEqual(first[1]?.note, undefined);

      yield* repository.replaceForThread({ threadId, tasks: [task("d", 1, "Only this")] });
      const second = yield* repository.listForThread({ threadId });
      assert.deepStrictEqual(
        second.map((row) => row.subject),
        ["Only this"],
      );
    }),
  );

  it.effect("accepts an empty replace as 'the plan is now empty'", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* ThreadTaskRecordRepository;
      yield* repository.replaceForThread({ threadId, tasks: [task("a", 1, "Something")] });
      yield* repository.replaceForThread({ threadId, tasks: [] });
      assert.deepStrictEqual(yield* repository.listForThread({ threadId }), []);
    }),
  );

  it.effect("scopes a replace to one thread", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* ThreadTaskRecordRepository;
      yield* repository.replaceForThread({ threadId, tasks: [task("a", 1, "Mine")] });
      yield* repository.replaceForThread({
        threadId: otherThreadId,
        tasks: [{ ...task("b", 1, "Theirs"), threadId: otherThreadId }],
      });
      assert.deepStrictEqual(
        (yield* repository.listForThread({ threadId })).map((row) => row.subject),
        ["Mine"],
      );
      assert.deepStrictEqual(
        (yield* repository.listForThread({ threadId: otherThreadId })).map((row) => row.subject),
        ["Theirs"],
      );
    }),
  );

  it.effect("creates the table and its (thread_id, position) index", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(thread_task_records)
      `;
      assert.deepStrictEqual(
        columns.map((column) => column.name),
        [
          "id",
          "thread_id",
          "position",
          "subject",
          "active_form",
          "status",
          "note",
          "created_at",
          "updated_at",
        ],
      );
      const indexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(thread_task_records)
      `;
      assert.ok(
        indexes.some((index) => index.name === "idx_thread_task_records_thread_position"),
        "the (thread_id, position) index exists",
      );
    }),
  );
});
