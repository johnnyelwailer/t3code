import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";

import {
  assertT3workContextRefreshNotSuperseded,
  dedupRefreshWorkItem,
  makeT3workContextRefreshSupersession,
  supersededRefreshError,
} from "./t3work-contextRefreshServiceDedup.ts";
import type { T3workContextRefreshInput } from "./t3work-contextRefreshServiceTypes.ts";

function refreshInput(force: boolean): T3workContextRefreshInput {
  return {
    threadId: ThreadId.make("thread-1"),
    projectId: "project-1",
    workspaceRoot: "/tmp/workspace",
    ticketKey: "AC-91",
    force,
  };
}

function syncedResult() {
  return {
    ok: true as const,
    status: "synced" as const,
    projectId: "project-1",
    ticketKey: "AC-91",
    availability: "full" as const,
    entryPointRelativePath: ".t3work/context/entrypoint.json",
    manifestRelativePath: ".t3work/context/manifest.json",
    includedCount: 1,
    skippedCount: 0,
  };
}

function makeLatch() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release: () => release() };
}

it.effect("dedupRefreshWorkItem shares one in-flight refresh for the same key", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const active = new Map();
      const supersessions = new Map();
      const started = makeLatch();
      const gate = makeLatch();
      let runs = 0;
      const runRefresh = Effect.gen(function* () {
        runs += 1;
        started.release();
        yield* Effect.promise(() => gate.wait);
        return syncedResult();
      });
      const first = yield* dedupRefreshWorkItem(
        active,
        supersessions,
        refreshInput(false),
        () => runRefresh,
      ).pipe(Effect.forkScoped);
      const second = yield* dedupRefreshWorkItem(
        active,
        supersessions,
        refreshInput(false),
        () => runRefresh,
      ).pipe(Effect.forkScoped);
      yield* Effect.promise(() => started.wait);
      assert.equal(runs, 1);
      gate.release();
      const firstResult = yield* Fiber.join(first);
      const secondResult = yield* Fiber.join(second);
      assert.deepStrictEqual(firstResult, syncedResult());
      assert.deepStrictEqual(secondResult, syncedResult());
      assert.equal(active.size, 0);
    }),
  ),
);

it.effect("makeT3workContextRefreshSupersession abort stops refresh checkpoints", () =>
  Effect.gen(function* () {
    const supersession = makeT3workContextRefreshSupersession();
    yield* assertT3workContextRefreshNotSuperseded(supersession);
    supersession.abort();
    const exit = yield* assertT3workContextRefreshNotSuperseded(supersession).pipe(Effect.exit);
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      assert.deepStrictEqual(Cause.squash(exit.cause), supersededRefreshError());
    }
  }),
);

it.effect("dedupRefreshWorkItem fails prior awaiters when force replaces refresh", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const active = new Map();
      const supersessions = new Map();
      const started = makeLatch();
      const gate = makeLatch();
      const runRefresh = Effect.gen(function* () {
        started.release();
        yield* Effect.promise(() => gate.wait);
        return syncedResult();
      });
      const leader = yield* dedupRefreshWorkItem(
        active,
        supersessions,
        refreshInput(false),
        () => runRefresh,
      ).pipe(Effect.forkScoped);
      yield* Effect.promise(() => started.wait);
      const waiter = yield* dedupRefreshWorkItem(
        active,
        supersessions,
        refreshInput(false),
        () => runRefresh,
      ).pipe(Effect.forkScoped);
      const forced = yield* dedupRefreshWorkItem(
        active,
        supersessions,
        refreshInput(true),
        () => runRefresh,
      ).pipe(Effect.forkScoped);
      const waiterExit = yield* Fiber.await(waiter);
      assert.isTrue(Exit.isFailure(waiterExit));
      if (Exit.isFailure(waiterExit)) {
        assert.deepStrictEqual(Cause.squash(waiterExit.cause), supersededRefreshError());
      }
      gate.release();
      const forcedResult = yield* Fiber.join(forced);
      assert.deepStrictEqual(forcedResult, syncedResult());
      yield* Fiber.interrupt(leader);
      assert.equal(active.size, 0);
    }),
  ),
);
