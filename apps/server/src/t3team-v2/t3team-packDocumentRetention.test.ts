import { assert, it } from "@effect/vitest";
import { defineCollections } from "@t3team/pack-api";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { TestClock } from "effect/testing";
import * as Store from "./t3team-packDocumentStore.ts";
import { eventSummary, keysOf, packStoreTestLayer } from "./t3team-packDocumentStore.testkit.ts";
import { collectAfterSnapshot } from "./t3team-v2Streams.testkit.ts";

const collections = defineCollections({
  items: { maxDocBytes: 1000, retention: { afterUnreadDays: 30 } },
  drafts: { maxDocBytes: 1000, retention: { afterUpdateDays: 7 } },
  notes: { maxDocBytes: 1000, retention: "keep" },
  quotaBytes: 100_000,
});
const packs = new Map([
  ["pack-a", collections],
  ["pack-b", collections],
]);
const withStore = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(packStoreTestLayer(packs)));
it.effect("an expired document reads as missing before retention deletes it", () =>
  withStore(
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const store = yield* service.forPack("pack-a");
      yield* store.put("items", "ttl", { n: 1 }, { ttlMs: 60_000 });
      yield* store.put("items", "stay", { n: 1 });
      yield* TestClock.adjust("2 minutes");
      assert.isNull(yield* store.get("items", "ttl"));
      assert.deepStrictEqual(keysOf(yield* store.list("items")), ["stay"]);
      const events = yield* collectAfterSnapshot(
        service.subscribe({ packId: "pack-a", collection: "items" }),
        3,
      );
      // Create-only succeeds: the expired row is purged (and announced) like a missing one.
      const recreated = yield* store.put("items", "ttl", { n: 2 }, { ifVersion: 0 });
      assert.strictEqual(recreated?.version, 1);
      assert.deepStrictEqual((yield* Fiber.join(events)).map(eventSummary), [
        "snapshot:stay",
        "removed:ttl",
        "upsert:ttl@1",
      ]);
    }),
  ),
);

it.effect("retention applies each collection's own rule and spares keep collections", () =>
  withStore(
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const store = yield* service.forPack("pack-a");
      const other = yield* service.forPack("pack-b");
      for (const key of ["read", "unread"]) yield* store.put("items", key, {});
      yield* store.put("drafts", "old", {});
      yield* store.put("notes", "kept", {});
      yield* other.put("items", "unread", {});
      yield* TestClock.adjust("6 days");
      yield* store.touch("items", "read");
      yield* TestClock.adjust("25 days");
      yield* store.put("drafts", "fresh", {});
      const items = yield* collectAfterSnapshot(
        service.subscribe({ packId: "pack-a", collection: "items" }),
        2,
      );
      const drafts = yield* collectAfterSnapshot(
        service.subscribe({ packId: "pack-a", collection: "drafts" }),
        2,
      );
      yield* service.runRetention;
      assert.deepStrictEqual((yield* Fiber.join(items)).map(eventSummary), [
        "snapshot:read,unread",
        "removed:unread",
      ]);
      assert.deepStrictEqual((yield* Fiber.join(drafts)).map(eventSummary), [
        "snapshot:fresh,old",
        "removed:old",
      ]);
      assert.deepStrictEqual(keysOf(yield* store.list("items")), ["read"]);
      assert.deepStrictEqual(keysOf(yield* store.list("drafts")), ["fresh"]);
      assert.deepStrictEqual(keysOf(yield* store.list("notes")), ["kept"]);
      // Pack B's rule ran on its own rows: its unread item is just as old, so it went too.
      assert.isNull(yield* other.get("items", "unread"));
    }),
  ),
);

it.effect("the quota evicts the least recently read documents first, never from keep", () =>
  Effect.gen(function* () {
    const service = yield* Store.T3TeamPackDocumentStore;
    const store = yield* service.forPack("pack-a");
    const hundredBytes = "x".repeat(98); // JSON-encoded with its quotes: exactly 100 bytes
    yield* store.put("notes", "kept", hundredBytes);
    yield* store.put("items", "a", hundredBytes);
    yield* TestClock.adjust("1 minute");
    yield* store.put("items", "b", hundredBytes);
    yield* TestClock.adjust("1 minute");
    yield* store.put("items", "c", hundredBytes);
    yield* TestClock.adjust("1 minute");
    yield* store.touch("items", "a");
    // 400 bytes against a 350-byte quota: evicting the least recently read item frees enough.
    // "kept" was read longest ago but its collection opts out of eviction.
    yield* service.runRetention;
    assert.deepStrictEqual(keysOf(yield* store.list("items")), ["a", "c"]);
    assert.deepStrictEqual(keysOf(yield* store.list("notes")), ["kept"]);
    yield* store.put("items", "d", hundredBytes);
    yield* service.runRetention;
    // c is now the least recently read evictable document.
    assert.deepStrictEqual(keysOf(yield* store.list("items")), ["a", "d"]);
  }).pipe(
    Effect.provide(
      packStoreTestLayer(
        new Map([
          [
            "pack-a",
            defineCollections({
              items: { maxDocBytes: 1000, retention: { afterUnreadDays: 365 } },
              notes: { maxDocBytes: 1000, retention: "keep" },
              quotaBytes: 350,
            }),
          ],
        ]),
      ),
    ),
  ),
);

it.effect("the layer runs a retention pass once the server activates", () =>
  Effect.gen(function* () {
    const gate = yield* Deferred.make<void>();
    yield* Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const store = yield* service.forPack("pack-a");
      yield* store.put("items", "ttl", {}, { ttlMs: 60_000 });
      yield* TestClock.adjust("2 minutes");
      const events = yield* collectAfterSnapshot(
        service.subscribe({ packId: "pack-a", collection: "items" }),
        2,
      );
      yield* Deferred.succeed(gate, undefined);
      assert.deepStrictEqual((yield* Fiber.join(events)).map(eventSummary), [
        "snapshot:",
        "removed:ttl",
      ]);
    }).pipe(Effect.provide(packStoreTestLayer(packs, Deferred.await(gate))));
  }),
);
