import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { SqlitePersistenceMemory } from "../../persistence/Sqlite.ts";
import * as EventSink from "../EventSink.ts";
import * as EventStore from "../EventStore.ts";
import * as ProjectionStore from "../ProjectionStore.ts";
import * as LegacyV1ThreadImporter from "./LegacyV1ThreadImporter.ts";

const databaseLayer = SqlitePersistenceMemory;
const storesProvided = Layer.mergeAll(
  databaseLayer,
  EventStore.layer.pipe(Layer.provideMerge(databaseLayer)),
  ProjectionStore.layer.pipe(Layer.provideMerge(databaseLayer)),
);
const TestLayer = Layer.mergeAll(
  storesProvided,
  LegacyV1ThreadImporter.layer.pipe(
    Layer.provide(
      Layer.mergeAll(storesProvided, EventSink.layer.pipe(Layer.provide(storesProvided))),
    ),
  ),
);

it.layer(TestLayer)("LegacyV1ThreadImporter fork hidden framing", (it) => {
  it.effect("does not import messages the fork marked invisible to the user", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const importer = yield* LegacyV1ThreadImporter.LegacyV1ThreadImporter;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:legacy-hidden");
      yield* sql`
        INSERT INTO projection_projects
          (project_id, title, workspace_root, scripts_json, created_at, updated_at, deleted_at)
        VALUES ('project:legacy-hidden', 'Legacy', '/tmp/legacy-hidden', '[]',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)
      `;
      yield* sql`
        INSERT INTO projection_threads
          (thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
           branch, worktree_path, latest_turn_id, created_at, updated_at, deleted_at)
        VALUES (${threadId}, 'project:legacy-hidden', 'Hidden framing',
          '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access', 'default', NULL, NULL, NULL,
          '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', NULL)
      `;
      yield* sql`
        INSERT INTO projection_thread_messages
          (message_id, thread_id, turn_id, role, text, attachments_json, is_streaming,
           created_at, updated_at, t3team_ext_json)
        VALUES
          ('m:1', ${threadId}, NULL, 'user', 'Visible question', '[]', 0,
            '2026-01-01T01:00:00.000Z', '2026-01-01T01:00:00.000Z', NULL),
          ('m:2', ${threadId}, NULL, 'user', 'Notification framing', '[]', 0,
            '2026-01-01T02:00:00.000Z', '2026-01-01T02:00:00.000Z',
            '{"visibleToUser":false,"notification":true}'),
          ('m:3', ${threadId}, NULL, 'assistant', 'Visible answer', '[]', 0,
            '2026-01-01T03:00:00.000Z', '2026-01-01T03:00:00.000Z', '{"visibleToUser":true}'),
          ('m:4', ${threadId}, NULL, 'user', 'Unreadable ext stays visible', '[]', 0,
            '2026-01-01T04:00:00.000Z', '2026-01-01T04:00:00.000Z', 'not json'),
          ('m:5', ${threadId}, NULL, 'assistant', 'Hidden agent note', '[]', 0,
            '2026-01-01T05:00:00.000Z', '2026-01-01T05:00:00.000Z', '{"visibleToUser":false}')
      `;

      yield* importer.reconcileShells;
      const shell = yield* projections.getThreadProjection(threadId);
      // The shell import carries the latest (user) message; hidden m:5 is not "latest".
      assert.deepStrictEqual(
        shell.messages.map((message) => message.id),
        ["m:4"],
      );
      yield* importer.ensureTranscript(threadId);
      const transcript = yield* projections.getThreadRecords(threadId, ["messages"]);
      assert.deepStrictEqual(transcript.messages.map((message) => message.id).toSorted(), [
        "m:1",
        "m:3",
        "m:4",
      ]);
    }),
  );
});
