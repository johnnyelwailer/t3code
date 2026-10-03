import { assert, it } from "@effect/vitest";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { mergeThreadFacts } from "./t3team-threadFactsMerge.ts";
import * as ThreadFactsStore from "./t3team-threadFactsStore.ts";
import { collectAfterSnapshot } from "./t3team-v2Streams.testkit.ts";

const TestLayer = ThreadFactsStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory));
const threadA = ThreadId.make("thread:facts-a");
const threadB = ThreadId.make("thread:facts-b");

it("merges patches, stamps changed labels and drops cleared extension keys", () => {
  const first = mergeThreadFacts(
    threadA,
    null,
    { activityLabel: "Writing tests", extensions: { "pack.a": 1, "pack.b": true } },
    "2026-01-01T00:00:00.000Z",
  );
  assert.deepStrictEqual(first, {
    threadId: threadA,
    activityLabel: "Writing tests",
    activityLabelUpdatedAt: "2026-01-01T00:00:00.000Z",
    extensions: { "pack.a": 1, "pack.b": true },
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  // Re-sending the same label is a no-op: no write, no stamp bump.
  assert.isNull(mergeThreadFacts(threadA, first, { activityLabel: "Writing tests" }, "later"));
  const second = mergeThreadFacts(
    threadA,
    first,
    { childStatus: "2 children running", extensions: { "pack.a": null, "pack.b": null } },
    "2026-01-01T00:05:00.000Z",
  );
  assert.deepStrictEqual(second, {
    threadId: threadA,
    activityLabel: "Writing tests",
    activityLabelUpdatedAt: "2026-01-01T00:00:00.000Z",
    childStatus: "2 children running",
    childStatusUpdatedAt: "2026-01-01T00:05:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
  });
});

it.layer(TestLayer)("T3TeamThreadFactsStore", (it) => {
  it.effect("persists patches and streams a snapshot followed by per-thread changes", () =>
    Effect.gen(function* () {
      const store = yield* ThreadFactsStore.T3TeamThreadFactsStore;
      yield* store.upsert(threadA, { retention: "ephemeral" });
      const filtered = yield* collectAfterSnapshot(store.subscribe({ threadId: threadA }), 3);
      const all = yield* collectAfterSnapshot(store.subscribe({}), 3);
      // Unchanged patches publish nothing; other threads are filtered out.
      yield* store.upsert(threadA, { retention: "ephemeral" });
      yield* store.upsert(threadB, {
        environment: { environmentId: EnvironmentId.make("env-remote") },
      });
      yield* store.upsert(threadA, { resourcePressurePaused: true });
      yield* store.remove(threadA);
      yield* store.remove(threadA);

      const filteredEvents = Array.from(yield* Fiber.join(filtered));
      assert.deepStrictEqual(
        filteredEvents.map((event) => event.type),
        ["snapshot", "upsert", "removed"],
      );
      const snapshot = filteredEvents[0];
      assert.ok(snapshot?.type === "snapshot");
      assert.deepStrictEqual(
        snapshot.facts.map((facts) => [facts.threadId, facts.retention]),
        [[threadA, "ephemeral"]],
      );
      const allEvents = Array.from(yield* Fiber.join(all));
      assert.deepStrictEqual(
        allEvents.map((event) =>
          event.type === "upsert" ? `upsert:${event.facts.threadId}` : event.type,
        ),
        ["snapshot", `upsert:${threadB}`, `upsert:${threadA}`],
      );

      assert.isNull(yield* store.get(threadA));
      const remote = yield* store.get(threadB);
      assert.strictEqual(remote?.environment?.environmentId, "env-remote");
      assert.lengthOf(yield* store.list(), 1);
    }),
  );
});
