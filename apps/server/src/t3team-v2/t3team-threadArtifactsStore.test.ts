import { assert, it } from "@effect/vitest";
import { MessageId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as ThreadArtifactsStore from "./t3team-threadArtifactsStore.ts";
import { collectAfterSnapshot } from "./t3team-v2Streams.testkit.ts";

const TestLayer = ThreadArtifactsStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory));
const thread = ThreadId.make("thread:artifacts");
const otherThread = ThreadId.make("thread:artifacts-other");

it.layer(TestLayer)("T3TeamThreadArtifactsStore", (it) => {
  it.effect("upserts by id, keeps createdAt, refuses moving threads and streams changes", () =>
    Effect.gen(function* () {
      const store = yield* ThreadArtifactsStore.T3TeamThreadArtifactsStore;
      const first = yield* store.upsert({
        id: "widget:1",
        threadId: thread,
        messageId: MessageId.make("message:1"),
        kind: "widget",
        payload: { title: "Chart", rows: [1, 2] },
      });
      const events = yield* collectAfterSnapshot(store.subscribe({ threadId: thread }), 4);

      // Identical re-upsert writes nothing and publishes nothing.
      const same = yield* store.upsert({
        id: "widget:1",
        threadId: thread,
        messageId: MessageId.make("message:1"),
        kind: "widget",
        payload: { title: "Chart", rows: [1, 2] },
      });
      assert.deepStrictEqual(same, first);
      yield* store.upsert({ id: "other:1", threadId: otherThread, kind: "card", payload: 1 });
      const updated = yield* store.upsert({
        id: "widget:1",
        threadId: thread,
        kind: "widget",
        payload: { title: "Chart", rows: [1, 2, 3] },
      });
      assert.strictEqual(updated.createdAt, first.createdAt);
      assert.isNull(updated.messageId);
      yield* store.upsert({ id: "draft:1", threadId: thread, kind: "draft-mutation", payload: {} });
      yield* store.remove("widget:1");

      const moved = yield* Effect.exit(
        store.upsert({ id: "other:1", threadId: thread, kind: "card", payload: 1 }),
      );
      assert.strictEqual(moved._tag, "Failure");
      const badKind = yield* Effect.exit(
        store.upsert({ id: "bad:1", threadId: thread, kind: "Not A Kind", payload: 1 }),
      );
      assert.strictEqual(badKind._tag, "Failure");

      const streamed = Array.from(yield* Fiber.join(events));
      assert.deepStrictEqual(
        streamed.map((event) =>
          event.type === "upsert" ? `upsert:${event.artifact.id}` : event.type,
        ),
        ["snapshot", "upsert:widget:1", "upsert:draft:1", "removed"],
      );
      const snapshot = streamed[0];
      assert.ok(snapshot?.type === "snapshot");
      assert.deepStrictEqual(
        snapshot.artifacts.map((artifact) => artifact.payload),
        [{ title: "Chart", rows: [1, 2] }],
      );
      assert.deepStrictEqual(
        (yield* store.listByThread(thread)).map((artifact) => artifact.id),
        ["draft:1"],
      );
      assert.isNull(yield* store.get("widget:1"));
    }),
  );
});
