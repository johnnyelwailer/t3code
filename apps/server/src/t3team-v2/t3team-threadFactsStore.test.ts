import { assert, it } from "@effect/vitest";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Sqlite.ts";
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

  it.effect("never overwrites a row it cannot decode and keeps keys it does not know", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const store = yield* ThreadFactsStore.T3TeamThreadFactsStore;
      const newer = ThreadId.make("thread:facts-newer");
      const drifted = ThreadId.make("thread:facts-drifted");
      // A newer build wrote a retention literal this build does not know.
      const driftedJson = `{"threadId":"${drifted}","retention":"archived-forever","environment":{"environmentId":"env-x"},"updatedAt":"2026-01-01T00:00:00.000Z"}`;
      yield* sql`INSERT INTO t3team_thread_facts (thread_id, facts_json, updated_at)
        VALUES (${drifted}, ${driftedJson}, '2026-01-01T00:00:00.000Z')`;
      const refused = yield* Effect.exit(store.upsert(drifted, { activityLabel: "Working" }));
      assert.strictEqual(refused._tag, "Failure");
      const [row] = yield* sql<{ readonly facts_json: string }>`
        SELECT facts_json FROM t3team_thread_facts WHERE thread_id = ${drifted}`;
      assert.strictEqual(row?.facts_json, driftedJson);

      // A decodable row with a key from a newer build keeps that key through an upsert.
      yield* sql`INSERT INTO t3team_thread_facts (thread_id, facts_json, updated_at)
        VALUES (${newer}, ${`{"threadId":"${newer}","futureFact":{"a":1},"updatedAt":"2026-01-01T00:00:00.000Z"}`},
          '2026-01-01T00:00:00.000Z')`;
      yield* store.upsert(newer, { retention: "ephemeral" });
      const [kept] = yield* sql<{ readonly facts_json: string }>`
        SELECT facts_json FROM t3team_thread_facts WHERE thread_id = ${newer}`;
      const stored = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
      )(kept?.facts_json ?? "{}");
      assert.deepStrictEqual(stored.futureFact, { a: 1 });
      assert.strictEqual(stored.retention, "ephemeral");
    }),
  );

  it.effect("leaves threads V2 deleted out of the all-threads snapshot", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const store = yield* ThreadFactsStore.T3TeamThreadFactsStore;
      const gone = ThreadId.make("thread:facts-gone");
      const live = ThreadId.make("thread:facts-live");
      yield* store.upsert(gone, { retention: "ephemeral" });
      yield* store.upsert(live, { retention: "ephemeral" });
      for (const [threadId, deletedAt] of [
        [gone, "2026-01-02T00:00:00.000Z"],
        [live, null],
      ] as const) {
        yield* sql`INSERT INTO orchestration_v2_projection_threads (thread_id, project_id, title,
          default_provider, runtime_mode, interaction_mode, created_at, updated_at, deleted_at,
          payload_json) VALUES (${threadId}, 'p', 't', 'codex', 'full-access', 'default',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', ${deletedAt}, '{}')`;
      }
      const snapshot = (yield* store.list()).map((facts) => facts.threadId);
      assert.notInclude(snapshot, gone);
      assert.include(snapshot, live);
      // One-thread reads are unfiltered (the owner may still need them to clean up).
      assert.isNotNull(yield* store.get(gone));
    }),
  );
});
