import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

import * as PacedChildProcessSpawner from "./t3team-pacedChildProcessSpawner.ts";

/** Records the longest gap between turns of a 5 ms ticker: how long the event loop was held. */
const startLoopGapMeter = () => {
  let last = performance.now();
  let longestGapMs = 0;
  // @effect-diagnostics-next-line globalTimers:off - measures the real event loop, outside the Effect scheduler
  const ticker = setInterval(() => {
    const now = performance.now();
    longestGapMs = Math.max(longestGapMs, now - last);
    last = now;
  }, 5);
  return {
    stop: () => {
      clearInterval(ticker);
      return Math.max(longestGapMs, performance.now() - last);
    },
  };
};

/** The longest the event loop went without turning while `effect` ran. */
const withLongestEventLoopBlockMs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(startLoopGapMeter),
    (meter) => Effect.map(effect, (result) => ({ result, longestBlockMs: meter.stop() })),
    (meter) => Effect.sync(() => void meter.stop()),
  );

/** What `child_process.spawn` costs on a busy Windows host: synchronous work before it returns. */
const spawnCostingMs = (costMs: number) =>
  Effect.sync(() => {
    const until = performance.now() + costMs;
    while (performance.now() < until) {
      /* busy, as CreateProcess is */
    }
  });

/** A pull-request sweep: every active thread's git lookup starts at once. */
const SWEEP_SPAWNS = 40;
const SPAWN_COST_MS = 25;
const EVENT_LOOP_BUDGET_MS = 100;

const sweep = (spawnOne: Effect.Effect<void>) =>
  Effect.forEach(Array.from({ length: SWEEP_SPAWNS }), () => spawnOne, {
    concurrency: 32,
    discard: true,
  });

describe("paced child process spawner", () => {
  it.live("a burst of costly spawns never holds the event loop past the budget", () =>
    Effect.gen(function* () {
      const pacer = yield* PacedChildProcessSpawner.makeSpawnPacer();
      const { longestBlockMs } = yield* withLongestEventLoopBlockMs(
        sweep(pacer.pace(spawnCostingMs(SPAWN_COST_MS))),
      );
      expect(longestBlockMs).toBeLessThan(EVENT_LOOP_BUDGET_MS);
    }),
  );

  it.live("the same burst without pacing holds the event loop for most of its spawns", () =>
    Effect.gen(function* () {
      const { longestBlockMs } = yield* withLongestEventLoopBlockMs(
        sweep(spawnCostingMs(SPAWN_COST_MS)),
      );
      expect(longestBlockMs).toBeGreaterThan(EVENT_LOOP_BUDGET_MS * 4);
    }),
  );

  it.live("a failed spawn releases the pacer for the next one", () =>
    Effect.gen(function* () {
      const pacer = yield* PacedChildProcessSpawner.makeSpawnPacer();
      const failed = yield* pacer.pace(Effect.fail("spawn failed")).pipe(Effect.flip);
      const next = yield* pacer.pace(Effect.succeed("spawned"));
      expect([failed, next]).toEqual(["spawn failed", "spawned"]);
    }),
  );

  it.live("real git processes started in a burst keep the event loop turning", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const { result: exitCodes, longestBlockMs } = yield* withLongestEventLoopBlockMs(
        Effect.forEach(
          Array.from({ length: SWEEP_SPAWNS }),
          () => spawner.exitCode(ChildProcess.make("git", ["--version"])),
          { concurrency: 32 },
        ),
      );
      expect(exitCodes.every((code) => code === 0)).toBe(true);
      expect(longestBlockMs).toBeLessThan(EVENT_LOOP_BUDGET_MS * 2.5);
    }).pipe(
      Effect.provide(Layer.provideMerge(PacedChildProcessSpawner.layer(), NodeServices.layer)),
    ),
  );
});
