import { assert, it } from "@effect/vitest";
import { defineCollections } from "@t3team/pack-api";
import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import * as Store from "./t3team-packDocumentStore.ts";
import { keysOf, packStoreTestLayer } from "./t3team-packDocumentStore.testkit.ts";

const TestLayer = packStoreTestLayer(
  new Map([
    [
      "pack-a",
      defineCollections({
        notes: { maxDocBytes: 64_000, retention: "keep", viewWritable: true },
        quotaBytes: 100_000,
      }),
    ],
  ]),
);
const fifteenKb = "x".repeat(15_000); // 15_002 bytes once JSON-encoded

it.layer(TestLayer)("Pack view write limits", (it) => {
  it.effect("a view writing in a loop stops at the quota, yet may rewrite in place", () =>
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      const put = (key: string, doc: string) =>
        service.putFromView({ packId: "pack-a", collection: "notes", key, doc });
      let refusal: string | undefined;
      for (let index = 0; index < 20 && refusal === undefined; index++) {
        refusal = yield* put(`note:${index}`, fifteenKb).pipe(
          Effect.as(undefined),
          Effect.catch((error) => Effect.succeed(error.message)),
        );
      }
      assert.strictEqual(refusal, "The pack's storage quota is full.");
      // 6 × 15_002 bytes fit in 100_000; the 7th would not.
      const store = yield* service.forPack("pack-a");
      assert.strictEqual((yield* store.list("notes")).length, 6);
      // Rewriting an existing document does not grow the pack, so it is still allowed.
      assert.strictEqual((yield* put("note:0", fifteenKb))?.version, 2);
      assert.strictEqual((yield* put("note:0", "small"))?.version, 3);
      assert.deepStrictEqual(keysOf(yield* store.list("notes", { prefix: "note:6" })), []);
    }),
  );

  it.effect("a deeply nested document under the byte cap is refused as invalid input", () =>
    Effect.gen(function* () {
      const service = yield* Store.T3TeamPackDocumentStore;
      // 40_000 bytes, under the cap. Nesting this deep must fail typed: a defect would fail the flip.
      let doc: Schema.Json = [];
      for (let depth = 1; depth < 20_000; depth++) doc = [doc];
      const error = yield* Effect.flip(
        service.putFromView({ packId: "pack-a", collection: "notes", key: "deep", doc }),
      );
      assert.strictEqual(error.message, "The pack document request is invalid.");
    }),
  );
});
