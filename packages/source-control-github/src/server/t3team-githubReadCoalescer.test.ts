import { assert, describe, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import { makeGitHubReadCoalescer } from "./t3team-githubReadCoalescer.ts";

const counting = () => {
  let loads = 0;
  const load = (value: string) =>
    Effect.sync(() => {
      loads += 1;
      return value;
    });
  return { loads: () => loads, load };
};

describe("GitHubReadCoalescer", () => {
  it.effect("N concurrent callers share one load", () =>
    Effect.gen(function* () {
      const coalescer = makeGitHubReadCoalescer<string, never>();
      const gate = yield* Deferred.make<void>();
      let loads = 0;
      const load = Effect.gen(function* () {
        loads += 1;
        yield* Deferred.await(gate);
        return "answer";
      });
      const fibers = yield* Effect.forEach(Array.from({ length: 5 }), () =>
        coalescer.share("k", "10 seconds", load).pipe(Effect.forkChild),
      );
      yield* Effect.yieldNow;
      yield* Deferred.succeed(gate, undefined);
      const results = yield* Effect.forEach(fibers, Fiber.join);
      assert.deepStrictEqual(
        results,
        Array.from({ length: 5 }, () => "answer"),
      );
      assert.strictEqual(loads, 1);
    }),
  );

  it.effect("does not keep a failure, so the next ask loads again", () =>
    Effect.gen(function* () {
      const coalescer = makeGitHubReadCoalescer<string, string>();
      const counter = counting();
      const failed = yield* Effect.flip(
        coalescer.share(
          "k",
          "10 seconds",
          counter.load("x").pipe(Effect.andThen(Effect.fail("no"))),
        ),
      );
      assert.strictEqual(failed, "no");
      const ok = yield* coalescer.share("k", "10 seconds", counter.load("fine"));
      assert.strictEqual(ok, "fine");
      assert.strictEqual(counter.loads(), 2);
    }),
  );

  it.effect("answers from the kept success until the ttl passes", () =>
    Effect.gen(function* () {
      const coalescer = makeGitHubReadCoalescer<string, never>();
      const counter = counting();
      yield* coalescer.share("k", "10 seconds", counter.load("a"));
      yield* TestClock.adjust("9 seconds");
      assert.strictEqual(yield* coalescer.share("k", "10 seconds", counter.load("b")), "a");
      yield* TestClock.adjust("2 seconds");
      assert.strictEqual(yield* coalescer.share("k", "10 seconds", counter.load("b")), "b");
      assert.strictEqual(counter.loads(), 2);
    }),
  );

  it.effect("an interrupted leader does not fail or hang its waiters", () =>
    Effect.gen(function* () {
      const coalescer = makeGitHubReadCoalescer<string, never>();
      const started = yield* Deferred.make<void>();
      const leader = yield* coalescer
        .share(
          "k",
          "10 seconds",
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      const counter = counting();
      const waiter = yield* coalescer
        .share("k", "10 seconds", counter.load("mine"))
        .pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(leader);
      assert.strictEqual(yield* Fiber.join(waiter), "mine");
      assert.strictEqual(counter.loads(), 1);
    }),
  );

  it.effect("drops the oldest answers past the weight bound", () =>
    Effect.gen(function* () {
      const coalescer = makeGitHubReadCoalescer<string, never>((value) => value.length);
      const counter = counting();
      const big = "x".repeat(10 * 1024 * 1024);
      yield* coalescer.share("first", "1 hour", counter.load(big));
      yield* coalescer.share("second", "1 hour", counter.load(big));
      yield* coalescer.share("second", "1 hour", counter.load(big));
      assert.strictEqual(counter.loads(), 2);
      yield* coalescer.share("first", "1 hour", counter.load(big));
      assert.strictEqual(counter.loads(), 3);
    }),
  );

  it.effect("drops the oldest answers past the entry bound", () =>
    Effect.gen(function* () {
      const coalescer = makeGitHubReadCoalescer<string, never>();
      const counter = counting();
      for (let index = 0; index <= 512; index++) {
        yield* coalescer.share(`k${index}`, "1 hour", counter.load("v"));
      }
      yield* coalescer.share("k0", "1 hour", counter.load("v"));
      assert.strictEqual(counter.loads(), 514);
      yield* coalescer.share("k512", "1 hour", counter.load("v"));
      assert.strictEqual(counter.loads(), 514);
    }),
  );
});
