import { assert, it } from "@effect/vitest";
import { MessageId, readT3TeamMessageExtContext, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { layerMemory as SqlitePersistenceMemory } from "../../persistence/Sqlite.ts";
import * as EventSink from "../EventSink.ts";
import * as EventStore from "../EventStore.ts";
import * as ProjectionStore from "../ProjectionStore.ts";
import * as LegacyV1ThreadImporter from "./LegacyV1ThreadImporter.ts";

/** `prepare` runs on the database before the importer reads its columns. */
const makeLayer = (prepare: Effect.Effect<unknown, Error, SqlClient.SqlClient> = Effect.void) => {
  const databaseLayer = SqlitePersistenceMemory;
  const stores = Layer.mergeAll(
    databaseLayer,
    EventStore.layer.pipe(Layer.provideMerge(databaseLayer)),
    ProjectionStore.layer.pipe(Layer.provideMerge(databaseLayer)),
  );
  const prepared = Layer.effectDiscard(Effect.orDie(prepare)).pipe(Layer.provide(stores));
  return Layer.mergeAll(
    stores,
    LegacyV1ThreadImporter.layer.pipe(
      Layer.provide(Layer.mergeAll(stores, prepared, EventSink.layer.pipe(Layer.provide(stores)))),
    ),
  );
};

const at = (hour: number) => `2026-01-01T${String(hour).padStart(2, "0")}:00:00.000Z`;

const insertThread = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO projection_projects
        (project_id, title, workspace_root, scripts_json, created_at, updated_at, deleted_at)
      VALUES ('project:legacy-ext', 'Legacy', '/tmp/legacy-ext', '[]', ${at(0)}, ${at(0)}, NULL)
      ON CONFLICT DO NOTHING
    `;
    yield* sql`
      INSERT INTO projection_threads
        (thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
         branch, worktree_path, latest_turn_id, created_at, updated_at, deleted_at)
      VALUES (${threadId}, 'project:legacy-ext', 'Fork rows',
        '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access', 'default', NULL, NULL, NULL,
        ${at(0)}, ${at(9)}, NULL)
    `;
  });

const insertMessage = (
  threadId: ThreadId,
  row: { id: string; role: string; text: string; hour: number; ext?: unknown },
) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql`
      INSERT INTO projection_thread_messages
        (message_id, thread_id, turn_id, role, text, attachments_json, is_streaming,
         created_at, updated_at, t3team_ext_json)
      VALUES (${row.id}, ${threadId}, NULL, ${row.role}, ${row.text}, '[]', 0,
        ${at(row.hour)}, ${at(row.hour)},
        ${row.ext === undefined ? null : typeof row.ext === "string" ? row.ext : JSON.stringify(row.ext)})
    `,
  );

const workItem = {
  kind: "resource" as const,
  resource: {
    provider: "tracker",
    kind: "issue" as const,
    id: "10001",
    title: "Fix the login form",
  },
};

const importTranscript = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const importer = yield* LegacyV1ThreadImporter.LegacyV1ThreadImporter;
    yield* importer.reconcileShells;
    yield* importer.ensureTranscript(threadId);
    return yield* (yield* ProjectionStore.ProjectionStoreV2).getThreadRecords(threadId, [
      "messages",
      "turnItems",
    ]);
  });

it.layer(makeLayer())("LegacyV1ThreadImporter fork messages", (it) => {
  it.effect("carries the fork ext and imports actor rows and system notes", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:legacy-ext");
      yield* insertThread(threadId);
      // A work-item send: the prompt carries the context dump, the person typed displayText.
      yield* insertMessage(threadId, {
        id: "m:kickoff",
        role: "user",
        text: "Please fix it\n\n<work-item>Fix the login form … full dump …</work-item>",
        hour: 1,
        ext: { displayText: "Please fix it", attachments: [workItem, { kind: "retired-kind" }] },
      });
      yield* insertMessage(threadId, {
        id: "m:actor",
        role: "actor",
        text: "Child finished: tests pass.",
        hour: 2,
        ext: {
          // An author of an older shape (no projectId) must not take the delivery info with it.
          author: { kind: "actor", threadId: "thread:child", title: "Child" },
          actor: {
            senderThreadId: "thread:child",
            urgency: "normal",
            hopCount: 1,
            rootThreadId: "thread:legacy-ext",
          },
        },
      });
      yield* insertMessage(threadId, {
        id: "m:reaction",
        role: "user",
        text: "[inter-agent framing]",
        hour: 3,
        ext: {
          visibleToUser: false,
          actor: {
            senderThreadId: "thread:child",
            urgency: "normal",
            hopCount: 1,
            rootThreadId: "thread:legacy-ext",
            messageIds: ["m:actor"],
          },
        },
      });
      yield* insertMessage(threadId, {
        id: "m:note",
        role: "system",
        text: "Which option?",
        hour: 4,
        ext: { author: { kind: "system" }, status: "waiting-for-input", attachments: [workItem] },
      });
      yield* insertMessage(threadId, {
        id: "m:bare-widget",
        role: "system",
        text: " \n",
        hour: 5,
        ext: { author: { kind: "system" } },
      });
      yield* insertMessage(threadId, { id: "m:answer", role: "assistant", text: "Done.", hour: 6 });
      yield* insertMessage(threadId, {
        id: "m:broken-ext",
        role: "user",
        text: "Thanks",
        hour: 7,
        ext: "not json",
      });

      const records = yield* importTranscript(threadId);
      const byId = new Map<string, (typeof records.messages)[number]>(
        records.messages.map((message) => [message.id, message]),
      );
      assert.deepStrictEqual(records.messages.map((message) => message.id).toSorted(), [
        "m:actor",
        "m:answer",
        "m:broken-ext",
        "m:kickoff",
        "m:note",
      ]);

      const kickoff = byId.get("m:kickoff");
      const kickoffExt = readT3TeamMessageExtContext(kickoff?.context);
      assert.strictEqual(kickoffExt?.displayText, "Please fix it");
      assert.deepStrictEqual(kickoffExt?.attachments, [workItem]);
      const kickoffItem = records.turnItems.find(
        (item) => item.type === "user_message" && item.messageId === MessageId.make("m:kickoff"),
      );
      assert.ok(kickoffItem?.type === "user_message");
      assert.strictEqual(
        readT3TeamMessageExtContext(kickoffItem.context)?.displayText,
        "Please fix it",
      );

      const actor = byId.get("m:actor");
      assert.strictEqual(actor?.role, "user");
      assert.strictEqual(actor?.createdBy, "agent");
      assert.strictEqual(actor?.senderThreadId, "thread:child");
      const actorItem = records.turnItems.find((item) => item.id === "t3team:turn-item:m:actor");
      assert.ok(actorItem?.type === "user_message");
      assert.strictEqual(actorItem.createdBy, "agent");

      // A system note keeps its small fields; its attachments are artifacts (cutover).
      const note = byId.get("m:note");
      assert.strictEqual(note?.role, "system");
      assert.deepStrictEqual(readT3TeamMessageExtContext(note?.context), {
        author: { kind: "system" },
        status: "waiting-for-input",
      });
      const noteItem = records.turnItems.find((item) => item.id === "t3team:turn-item:m:note");
      assert.ok(noteItem?.type === "system_notice");
      assert.strictEqual(noteItem.message, "Which option?");

      assert.isUndefined(readT3TeamMessageExtContext(byId.get("m:broken-ext")?.context));
      // Ordinals follow V1 order across every imported role.
      assert.deepStrictEqual(
        records.turnItems.toSorted((a, b) => a.ordinal - b.ordinal).map((item) => item.id),
        [
          "migration:v1:turn-item:m:kickoff",
          "t3team:turn-item:m:actor",
          "t3team:turn-item:m:note",
          "migration:v1:turn-item:m:answer",
          "migration:v1:turn-item:m:broken-ext",
        ],
      );
    }),
  );
});

const upstreamThreadId = ThreadId.make("thread:legacy-upstream");
const seedUpstreamDatabase = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* insertThread(upstreamThreadId);
  yield* insertMessage(upstreamThreadId, { id: "u:1", role: "user", text: "Hello", hour: 1 });
  yield* insertMessage(upstreamThreadId, { id: "u:2", role: "system", text: "Note", hour: 2 });
  yield* insertMessage(upstreamThreadId, { id: "u:3", role: "assistant", text: "Hi", hour: 3 });
  yield* sql`ALTER TABLE projection_thread_messages DROP COLUMN t3team_ext_json`;
});

it.layer(makeLayer(seedUpstreamDatabase))(
  "LegacyV1ThreadImporter on an upstream database",
  (it) => {
    it.effect("imports user and assistant rows unchanged without the fork ext column", () =>
      Effect.gen(function* () {
        const threadId = upstreamThreadId;

        const records = yield* importTranscript(threadId);
        assert.deepStrictEqual(
          records.messages.map((message) => `${message.id}:${message.role}:${message.context}`),
          ["u:1:user:undefined", "u:3:assistant:undefined"],
        );
      }),
    );
  },
);
