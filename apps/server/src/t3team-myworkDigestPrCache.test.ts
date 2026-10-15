import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { readCached, resetDigestPrCacheForTests } from "./t3team-myworkDigestPrCache.ts";

describe("digest readCached", () => {
  it.effect("serves a read from a 90 s poll, then shows the refreshed read on the next one", () =>
    Effect.gen(function* () {
      resetDigestPrCacheForTests();
      let loads = 0;
      const load = Effect.sync(() => ++loads);
      assert.strictEqual((yield* readCached("k", load, 0)).read, 1);
      yield* TestClock.adjust("90 seconds");
      const poll = yield* readCached("k", load, 0);
      assert.deepStrictEqual(poll, { read: 1, pending: false });
      assert.strictEqual(loads, 1);
      yield* TestClock.adjust("90 seconds");
      const stale = yield* readCached("k", load, 0);
      assert.deepStrictEqual(stale, { read: 2, pending: false });
    }),
  );
});
