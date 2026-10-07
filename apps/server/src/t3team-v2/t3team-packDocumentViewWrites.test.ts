import { assert, it } from "@effect/vitest";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import { defineCollections } from "@t3team/pack-api";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Stream from "effect/Stream";
import * as RpcTest from "effect/rpc/RpcTest";
import * as RpcAuthorization from "../auth/RpcAuthorization.ts";
import { RPC_REQUIRED_SCOPES } from "../auth/RpcAuthorization.ts";
import { makePackDocumentHub } from "./t3team-packDocumentHub.ts";
import * as Store from "./t3team-packDocumentStore.ts";
import { packDocumentStream } from "./t3team-packDocumentStream.ts";
import { eventSummary, keysOf, packStoreTestLayer } from "./t3team-packDocumentStore.testkit.ts";
import { collectAfterSnapshot } from "./t3team-v2Streams.testkit.ts";

const collections = defineCollections({
  items: { maxDocBytes: 64, retention: "keep" },
  notes: { maxDocBytes: 64, retention: "keep", viewWritable: true },
  quotaBytes: 100_000,
});
const TestLayer = packStoreTestLayer(
  new Map([
    ["pack-a", collections],
    ["pack-b", collections],
  ]),
);
const failureMessage = <A>(effect: Effect.Effect<A, Store.T3TeamPackDocumentStoreError>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.message));

it.layer(TestLayer)("Pack document view writes and removal", (it) => {
  it.effect("views write only to viewWritable collections, with the store's CAS and byte cap", () =>
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const put = (collection: string, ifVersion?: number, doc: unknown = { text: "hi" }) =>
        service.putFromView({
          packId: "pack-a",
          collection,
          key: "note",
          doc: doc as never,
          ...(ifVersion === undefined ? {} : { ifVersion }),
        });
      assert.strictEqual((yield* put("notes", 0))?.version, 1);
      assert.isNull(yield* put("notes", 0));
      assert.strictEqual((yield* put("notes", 1))?.version, 2);
      assert.strictEqual(
        yield* failureMessage(put("items")),
        "This collection is not writable from views.",
      );
      assert.isNull(yield* (yield* service.forPack("pack-a")).get("items", "note"));
      assert.strictEqual(
        yield* failureMessage(put("notes", undefined, "x".repeat(100))),
        "The document exceeds the collection's byte limit.",
      );
      assert.strictEqual(
        yield* failureMessage(
          service.putFromView({ packId: "pack-z", collection: "notes", key: "note", doc: {} }),
        ),
        "The pack has no registered document store.",
      );
      assert.strictEqual(
        yield* failureMessage(put("missing")),
        "The pack does not declare this collection.",
      );
      // Pack isolation: pack B's view sees nothing pack A's view wrote.
      assert.isNull(yield* (yield* service.forPack("pack-b")).get("notes", "note"));
    }),
  );

  it.effect("remove publishes a removed event per document, only to the owning pack", () =>
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const a = yield* service.forPack("pack-a");
      const b = yield* service.forPack("pack-b");
      yield* a.put("items", "page:1", {});
      yield* a.put("items", "page:2", {});
      yield* a.put("items", "solo", {});
      yield* b.put("items", "page:1", {});
      const events = yield* collectAfterSnapshot(
        service.subscribe({ packId: "pack-a", collection: "items", prefix: "page:" }),
        3,
      );
      assert.strictEqual(yield* a.remove("items", { prefix: "page:" }), 2);
      assert.strictEqual(yield* a.remove("items", "solo"), 1);
      assert.strictEqual(yield* a.remove("items", "solo"), 0);
      const collected = (yield* Fiber.join(events)).map(eventSummary);
      assert.strictEqual(collected[0], "snapshot:page:1,page:2");
      assert.deepStrictEqual(collected.slice(1).toSorted(), ["removed:page:1", "removed:page:2"]);
      assert.deepStrictEqual(keysOf(yield* a.list("items")), []);
      assert.deepStrictEqual(keysOf(yield* b.list("items")), ["page:1"]);
    }),
  );

  it.effect("a failed subscription is logged on the server and tells the client why", () =>
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const logged: unknown[] = [];
      const error = yield* service.subscribe({ packId: "pack-a", collection: "missing" }).pipe(
        Stream.runDrain,
        Effect.flip,
        Effect.provide(
          Logger.layer([Logger.make(({ message }) => void logged.push(message))], {
            mergeWithExisting: false,
          }),
        ),
      );
      assert.strictEqual(error.message, "The pack does not declare this collection.");
      assert.include(JSON.stringify(logged), "t3team.packDocuments.subscribe-failed");
    }),
  );
});

it.effect("a subscriber that overflows its buffer is resynced with a fresh snapshot", () =>
  Effect.gen(function* () {
    const hub = yield* makePackDocumentHub(2);
    const reading = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    let reads = 0;
    const snapshot = Effect.suspend(() => {
      reads += 1;
      return reads === 1
        ? Deferred.succeed(reading, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as([]),
          )
        : Effect.succeed([]);
    });
    const collector = yield* packDocumentStream(
      hub,
      { packId: "pack-a", collection: "items" },
      snapshot,
    ).pipe(Stream.take(3), Stream.runCollect, Effect.forkScoped);
    yield* Deferred.await(reading);
    const doc = (key: string) => ({
      key,
      version: 1,
      doc: {},
      updatedAt: "2026-10-07T00:00:00.000Z",
    });
    // Another pack's traffic never occupies this subscriber's buffer.
    for (const key of ["x1", "x2", "x3"])
      yield* hub.publish([
        { type: "upsert", packId: "pack-b", collection: "items", doc: doc(key) },
      ]);
    for (const key of ["a", "b", "c"])
      yield* hub.publish([
        { type: "upsert", packId: "pack-a", collection: "items", doc: doc(key) },
      ]);
    yield* Deferred.succeed(release, undefined);
    yield* hub.publish([{ type: "upsert", packId: "pack-a", collection: "items", doc: doc("d") }]);
    assert.deepStrictEqual((yield* Fiber.join(collector)).map(eventSummary), [
      "snapshot:",
      "snapshot:",
      "upsert:d@1",
    ]);
    assert.strictEqual(reads, 2);
  }),
);

it.effect("the view write RPC needs the operate scope before its handler runs", () =>
  Effect.gen(function* () {
    const group = WsRpcGroup.omit(
      ...[...WsRpcGroup.requests.keys()].filter(
        (
          tag,
        ): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, typeof WS_METHODS.t3teamPackStorePut> =>
          tag !== WS_METHODS.t3teamPackStorePut,
      ),
    );
    const handled: string[] = [];
    const clientWith = (
      scope: typeof AuthOrchestrationReadScope | typeof AuthOrchestrationOperateScope,
    ) =>
      RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.mergeAll(
            group.toLayerHandler(WS_METHODS.t3teamPackStorePut, (input) =>
              Effect.sync(() => handled.push(input.key)).pipe(Effect.as(null)),
            ),
            RpcAuthorization.layer([scope]),
          ),
        ),
      );
    const input = { packId: "pack-a", collection: "notes", key: "note", doc: {} };
    const reader = yield* clientWith(AuthOrchestrationReadScope);
    assert.deepInclude(yield* reader[WS_METHODS.t3teamPackStorePut](input).pipe(Effect.flip), {
      _tag: "EnvironmentAuthorizationError",
      requiredScope: AuthOrchestrationOperateScope,
    });
    assert.deepStrictEqual(handled, []);
    const writer = yield* clientWith(AuthOrchestrationOperateScope);
    assert.isNull(yield* writer[WS_METHODS.t3teamPackStorePut](input));
    assert.deepStrictEqual(handled, ["note"]);
  }).pipe(Effect.scoped),
);
