import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { layerMemory as SqlitePersistenceMemory } from "../../persistence/Sqlite.ts";
import * as ThreadArtifactsStore from "../../t3team-v2/t3team-threadArtifactsStore.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "../../t3team-v2/t3team-v2Orchestrator.testkit.ts";
import { runLegacyRichMessageCutover } from "./t3team-legacyRichMessageCutover.ts";

const makeLayer = (name: string) =>
  ThreadArtifactsStore.layer.pipe(
    Layer.provideMerge(makeT3TeamV2TestLayer(name)),
    Layer.provide(SqlitePersistenceMemory),
  );

const id = (name: string) => ThreadId.make(`thread:rich:${name}`);
const at = (minute: number) => `2026-01-01T00:${String(minute).padStart(2, "0")}:00.000Z`;

const insertRow = (row: {
  id: string;
  thread: string;
  role: string;
  text?: string;
  minute: number;
  ext: unknown;
}) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql`INSERT INTO projection_thread_messages
      (message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at,
       t3team_ext_json)
      VALUES (${row.id}, ${id(row.thread)}, NULL, ${row.role}, ${row.text ?? ""}, 0,
        ${at(row.minute)}, ${at(row.minute)}, ${JSON.stringify(row.ext)})`,
  );

const widget = {
  kind: "widget",
  widget: { widgetId: "chart-1", title: "Burndown", format: "svg", html: "<svg/>" },
};
const resource = {
  kind: "resource",
  resource: { provider: "tracker", kind: "issue", id: "42", title: "Login form" },
};
const draft = {
  kind: "draft-mutation",
  draft: {
    id: "jira-draft:carrier-1",
    kind: "jira-work-item-draft",
    tool: "update_issue",
    target: { provider: "jira", issueIdOrKey: "PROJ-1" },
    field: "estimate",
    patch: { hours: 3 },
    status: "draft",
    commitPolicy: { requiresUserApproval: true, commitSurface: "work-item" },
  },
};
const actor = (hopCount: number, messageIds?: ReadonlyArray<string>) => ({
  senderThreadId: id("child"),
  urgency: "normal",
  hopCount,
  rootThreadId: id("parent"),
  ...(messageIds === undefined ? {} : { messageIds }),
});
const actorAuthor = { kind: "actor", threadId: id("child"), projectId: "p", title: "Child" };

it.layer(makeLayer("t3team-legacy-rich"))("runLegacyRichMessageCutover", (it) => {
  it.effect("carries system attachments, drafts and pending deliveries, once", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      for (const name of ["parent", "child"]) yield* createTestThread(id(name));
      const system = { author: { kind: "system" } };
      yield* insertRow({
        id: "s:widget",
        thread: "parent",
        role: "system",
        minute: 1,
        ext: { ...system, attachments: [widget] },
      });
      yield* insertRow({
        id: "s:note",
        thread: "parent",
        role: "system",
        text: "Pick one",
        minute: 2,
        ext: { ...system, attachments: [resource] },
      });
      yield* insertRow({
        id: "carrier-1",
        thread: "parent",
        role: "system",
        minute: 3,
        ext: { ...system, visibleToUser: false, attachments: [draft] },
      });
      yield* insertRow({
        id: "s:gone",
        thread: "gone",
        role: "system",
        minute: 4,
        ext: { ...system, attachments: [widget] },
      });
      // Deliveries: a1 reacted by id, a2 pending, a3 reacted by a legacy single-entry turn,
      // a4 over the hop cap (never delivered), a5 to a thread V2 does not have.
      yield* insertRow({
        id: "a1",
        thread: "parent",
        role: "actor",
        text: "one",
        minute: 5,
        ext: { author: actorAuthor, actor: actor(1) },
      });
      yield* insertRow({
        id: "r1",
        thread: "parent",
        role: "user",
        minute: 6,
        ext: { visibleToUser: false, actor: actor(1, ["a1"]) },
      });
      yield* insertRow({
        id: "a2",
        thread: "parent",
        role: "actor",
        text: "two",
        minute: 7,
        ext: { author: actorAuthor, actor: { ...actor(2), summary: "Second" } },
      });
      yield* insertRow({
        id: "a3",
        thread: "parent",
        role: "actor",
        text: "three",
        minute: 8,
        ext: { author: actorAuthor, actor: actor(3) },
      });
      yield* insertRow({
        id: "r3",
        thread: "parent",
        role: "user",
        minute: 9,
        ext: { visibleToUser: false, actor: actor(3) },
      });
      yield* insertRow({
        id: "a4",
        thread: "parent",
        role: "actor",
        text: "four",
        minute: 10,
        ext: { author: actorAuthor, actor: actor(99) },
      });
      yield* insertRow({
        id: "a5",
        thread: "gone",
        role: "actor",
        text: "five",
        minute: 11,
        ext: { author: actorAuthor, actor: actor(1) },
      });

      assert.deepStrictEqual(yield* runLegacyRichMessageCutover, {
        artifacts: 3,
        pendingDeliveries: 1,
        heldThreads: 1,
      });

      const artifacts =
        yield* (yield* ThreadArtifactsStore.T3TeamThreadArtifactsStore).listByThread(id("parent"));
      assert.deepStrictEqual(
        artifacts.map((artifact) => [
          artifact.id,
          artifact.kind,
          artifact.messageId,
          artifact.createdAt,
        ]),
        [
          ["widget:chart-1", "widget", null, at(1)],
          ["message-ext:s:note", "message-ext", "s:note", at(2)],
          ["jira-draft:carrier-1", "draft-mutation", null, at(3)],
        ],
      );
      assert.deepStrictEqual(artifacts[2]?.payload, draft);

      const mailbox = yield* sql<{
        readonly message_id: string;
        readonly to_thread_id: string;
        readonly from_title: string;
        readonly summary: string | null;
        readonly state: string;
      }>`SELECT message_id, to_thread_id, from_title, summary, state FROM t3team_thread_mailbox`;
      assert.deepStrictEqual(mailbox, [
        {
          message_id: "a2",
          to_thread_id: id("parent"),
          from_title: "Child",
          summary: "Second",
          state: "pending",
        },
      ]);
      const holds = yield* sql<{ readonly thread_id: string }>`
        SELECT thread_id FROM t3team_thread_mailbox_holds`;
      assert.deepStrictEqual(
        holds.map((row) => row.thread_id),
        [id("parent")],
      );

      assert.isNull(yield* runLegacyRichMessageCutover);
    }),
  );
});

it.layer(makeLayer("t3team-legacy-rich-upstream-db"))("runLegacyRichMessageCutover", (it) => {
  it.effect("has nothing to carry on a database without the fork ext column", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`ALTER TABLE projection_thread_messages DROP COLUMN t3team_ext_json`;
      assert.deepStrictEqual(yield* runLegacyRichMessageCutover, {
        artifacts: 0,
        pendingDeliveries: 0,
        heldThreads: 0,
      });
      const ledger = yield* sql<{ readonly step: string }>`SELECT step FROM t3team_v2_cutover`;
      assert.deepStrictEqual(
        ledger.map((row) => row.step),
        ["v1-rich-messages"],
      );
    }),
  );
});
