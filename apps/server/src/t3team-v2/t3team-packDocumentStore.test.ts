import { assert, it } from "@effect/vitest";
import { defineCollections } from "@t3team/pack-api";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import { layerMemory } from "../persistence/Sqlite.ts";
import * as Store from "./t3team-packDocumentStore.ts";
import { packDocumentStream, type PackDocumentChange } from "./t3team-packDocumentStream.ts";
import { collectAfterSnapshot } from "./t3team-v2Streams.testkit.ts";

const config = defineCollections({
  items: { maxDocBytes: 256, retention: "keep" },
  quotaBytes: 1024,
});
const TestLayer = Store.layer.pipe(
  Layer.provide(
    Layer.succeed(
      Store.PackDocumentCollections,
      new Map([
        ["pack-a", config],
        ["pack-b", config],
      ]),
    ),
  ),
  Layer.provideMerge(layerMemory),
);
it.layer(TestLayer)("Pack documents", (it) => {
  it.effect("two racing fibers return the same winner and exactly one inserts", () =>
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const store = yield* service.forPack("pack-a");
      const start = yield* Deferred.make<void>();
      const contender = (owner: string) =>
        Deferred.await(start).pipe(
          Effect.andThen(store.insertOrGet("items", "race", { owner })),
          Effect.forkScoped,
        );
      const a = yield* contender("a");
      const b = yield* contender("b");
      yield* Deferred.succeed(start, undefined);
      const first = yield* Fiber.join(a);
      const second = yield* Fiber.join(b);
      assert.strictEqual(Number(first.inserted) + Number(second.inserted), 1);
      assert.deepStrictEqual(first.doc, second.doc);
      assert.strictEqual(first.doc.version, 1);
    }),
  );
  it.effect("CAS rejects stale versions and create-only writes", () =>
    Effect.gen(function* () {
      const store = yield* (yield* Store.T3TeamPackDocumentStore).forPack("pack-a");
      const first = yield* store.put("items", "cas", { text: "first" }, { ifVersion: 0 });
      assert.strictEqual(first?.version, 1);
      assert.isNull(yield* store.put("items", "cas", {}, { ifVersion: 0 }));
      assert.isNull(yield* store.put("items", "missing", {}, { ifVersion: 1 }));
      const second = yield* store.put(
        "items",
        "cas",
        { text: "second" },
        { ifVersion: 1, ttlMs: 1000 },
      );
      assert.strictEqual(second?.version, 2);
      assert.ok(second?.expiresAt);
      assert.isNull(yield* store.put("items", "cas", { text: "stale" }, { ifVersion: 1 }));
      assert.deepStrictEqual((yield* store.get("items", "cas"))?.doc, { text: "second" });
    }),
  );
  it.effect("pack-bound reads, writes and subscriptions are isolated", () =>
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const a = yield* service.forPack("pack-a");
      const b = yield* service.forPack("pack-b");
      yield* b.put("items", "shared", { owner: "b" });
      assert.isNull(yield* a.get("items", "shared"));
      assert.deepStrictEqual(yield* a.list("items", { prefix: "shared" }), []);
      const events = yield* collectAfterSnapshot(
        service.subscribe({ packId: "pack-a", collection: "items", key: "shared" }),
        2,
      );
      yield* b.put("items", "shared", { owner: "b2" });
      yield* a.put("items", "shared", { owner: "a" });
      const collected = yield* Fiber.join(events);
      // Pack B's write must not reach pack A's stream: the only live event is A's own upsert.
      assert.deepStrictEqual(
        collected.map((event) =>
          event.type === "upsert" ? { type: event.type, doc: event.doc.doc } : { type: event.type },
        ),
        [{ type: "snapshot" }, { type: "upsert", doc: { owner: "a" } }],
      );
      assert.deepStrictEqual((yield* b.get("items", "shared"))?.doc, { owner: "b2" });
      assert.deepStrictEqual((yield* a.get("items", "shared"))?.doc, { owner: "a" });
      assert.strictEqual((yield* Effect.exit(service.forPack("unknown")))._tag, "Failure");
      assert.strictEqual((yield* Effect.exit(a.get("other", "shared")))._tag, "Failure");
    }),
  );
  it.effect(
    "increments durable counters atomically and lists exact prefixes with keyset pagination",
    () =>
      Effect.gen(function* () {
        const store = yield* (yield* Store.T3TeamPackDocumentStore).forPack("pack-a");
        const values = yield* Effect.all(
          [
            store.increment("items", "counter", "attempts", 1),
            store.increment("items", "counter", "attempts", 1),
          ],
          { concurrency: 2 },
        );
        assert.deepStrictEqual(values.toSorted(), [1, 2]);
        assert.deepStrictEqual((yield* store.get("items", "counter"))?.doc, { attempts: 2 });
        yield* store.put("items", "page:1", {});
        yield* store.put("items", "page:2", {});
        yield* store.put("items", "page:3", {});
        assert.deepStrictEqual(
          (yield* store.list("items", { prefix: "page:", after: "page:1", limit: 1 })).map(
            (d) => d.key,
          ),
          ["page:2"],
        );
        assert.deepStrictEqual(yield* store.list("items", { prefix: "page_" }), []);
      }),
  );
  it.effect(
    "rejects invalid keys, non-JSON data, byte overflow and non-numeric counters without writing",
    () =>
      Effect.gen(function* () {
        const store = yield* (yield* Store.T3TeamPackDocumentStore).forPack("pack-a");
        for (const effect of [
          store.put("items", "bad key", {}),
          store.put("items", "invalid", { n: NaN }),
          store.put("items", "invalid", undefined),
          store.put("items", "invalid", "😀".repeat(100)),
          store.put("items", "invalid", {}, { ifVersion: -1 }),
          store.list("items", { limit: 0 }),
          store.increment("items", "invalid", "n", Infinity),
        ] as ReadonlyArray<Effect.Effect<unknown, Store.T3TeamPackDocumentStoreError>>)
          assert.strictEqual((yield* Effect.exit(effect))._tag, "Failure");
        assert.isNull(yield* store.get("items", "invalid"));
        yield* store.put("items", "null-counter", null);
        assert.strictEqual(
          (yield* Effect.exit(store.increment("items", "null-counter", "n", 1)))._tag,
          "Failure",
        );
        assert.strictEqual((yield* store.get("items", "null-counter"))?.doc, null);
        yield* store.put("items", "string-counter", { n: "one" });
        assert.strictEqual(
          (yield* Effect.exit(store.increment("items", "string-counter", "n", 1)))._tag,
          "Failure",
        );
      }),
  );
});

it.effect("buffers a write made while the snapshot is blocked", () =>
  Effect.gen(function* () {
    const changes = yield* PubSub.unbounded<PackDocumentChange>();
    const reading = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const doc = {
      key: "item",
      version: 1,
      doc: { ready: true },
      updatedAt: "2026-10-07T00:00:00.000Z",
    };
    const snapshot = Deferred.succeed(reading, undefined).pipe(
      Effect.andThen(Deferred.await(release)),
      Effect.as([]),
    );
    const collector = yield* packDocumentStream(
      changes,
      { packId: "pack-a", collection: "items" },
      snapshot,
    ).pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped);
    yield* Deferred.await(reading);
    yield* PubSub.publish(changes, { type: "upsert", packId: "pack-a", collection: "items", doc });
    yield* Deferred.succeed(release, undefined);
    assert.deepStrictEqual(yield* Fiber.join(collector), [
      { type: "snapshot", packId: "pack-a", collection: "items", documents: [] },
      { type: "upsert", packId: "pack-a", collection: "items", doc },
    ]);
  }),
);
