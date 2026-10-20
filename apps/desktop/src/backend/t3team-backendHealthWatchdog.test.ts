import { assert, describe, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import {
  BackendHealthProbeError,
  BackendWatchdogKillHistory,
  DEFAULT_BACKEND_HEALTH_WATCHDOG_CONFIG,
  resolveBackendHealthWatchdogConfig,
  runBackendHealthWatchdog,
  watchBackendHealth,
  type BackendHealthWatchdogConfig,
} from "./t3team-backendHealthWatchdog.ts";
import { makeBackendLiveness, type BackendLiveness } from "./t3team-backendLiveness.ts";

const config: BackendHealthWatchdogConfig = {
  ...DEFAULT_BACKEND_HEALTH_WATCHDOG_CONFIG,
  interval: Duration.seconds(1),
  probeTimeout: Duration.seconds(1),
  failureThreshold: 3,
  warmup: Duration.seconds(2),
  maxKillsPerWindow: 2,
  killWindow: Duration.minutes(10),
  busyGrace: Duration.minutes(2),
};

const failingProbe = Effect.fail(new BackendHealthProbeError({ reason: "ECONNRESET" }));

describe("resolveBackendHealthWatchdogConfig", () => {
  it("defaults to roughly 30s before a kill", () => {
    const c = resolveBackendHealthWatchdogConfig({});
    const worst =
      c.failureThreshold * (Duration.toMillis(c.interval) + Duration.toMillis(c.probeTimeout));
    assert.isTrue(c.enabled);
    assert.strictEqual(worst, 30_000);
  });

  it("reads env overrides and ignores junk", () => {
    const c = resolveBackendHealthWatchdogConfig({
      T3TEAM_BACKEND_WATCHDOG_INTERVAL_MS: "500",
      T3TEAM_BACKEND_WATCHDOG_TIMEOUT_MS: "nope",
      T3TEAM_BACKEND_WATCHDOG_FAILURES: "7",
    });
    assert.strictEqual(Duration.toMillis(c.interval), 500);
    assert.strictEqual(Duration.toMillis(c.probeTimeout), 3_000);
    assert.strictEqual(c.failureThreshold, 7);
    assert.isFalse(resolveBackendHealthWatchdogConfig({ T3TEAM_BACKEND_WATCHDOG: "0" }).enabled);
  });
});

describe("watchBackendHealth", () => {
  it.effect("reports unhealthy after N consecutive failures", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(watchBackendHealth({ config, probe: failingProbe }));
      yield* TestClock.adjust(Duration.seconds(10));
      const result = yield* Fiber.join(fiber);
      assert.strictEqual(result.consecutiveFailures, 3);
      assert.include(result.lastFailure, "ECONNRESET");
    }),
  );

  it.effect("counts hung probes as failures via the probe timeout", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(watchBackendHealth({ config, probe: Effect.never }));
      yield* TestClock.adjust(Duration.seconds(10));
      const result = yield* Fiber.join(fiber);
      assert.strictEqual(result.consecutiveFailures, 3);
      assert.include(result.lastFailure, "no reply");
    }),
  );

  it.effect("a successful probe resets the counter", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0);
      // fail, fail, ok, fail, fail, fail
      const probe = Ref.updateAndGet(calls, (n) => n + 1).pipe(
        Effect.flatMap((n) => (n === 3 ? Effect.void : failingProbe)),
      );
      const fiber = yield* Effect.forkChild(watchBackendHealth({ config, probe }));
      yield* TestClock.adjust(Duration.seconds(20));
      yield* Fiber.join(fiber);
      assert.strictEqual(yield* Ref.get(calls), 6);
    }),
  );
});

describe("runBackendHealthWatchdog", () => {
  it.effect("kills after warm-up and failures, then stops at the kill budget", () =>
    Effect.gen(function* () {
      let clock = 0;
      const history = new BackendWatchdogKillHistory(() => clock);
      const kills = yield* Ref.make(0);
      const logs: Array<string> = [];
      const run = runBackendHealthWatchdog({
        config,
        history,
        probe: failingProbe,
        kill: Ref.update(kills, (n) => n + 1),
        log: (message) => Effect.sync(() => void logs.push(message)),
      });
      for (let i = 0; i < 3; i++) {
        const fiber = yield* Effect.forkChild(run);
        yield* TestClock.adjust(Duration.minutes(1));
        yield* Fiber.join(fiber);
        clock += 1_000;
      }
      assert.strictEqual(yield* Ref.get(kills), 2);
      assert.include(logs[2], "budget spent");
      // budget refills once the window passes
      clock += Duration.toMillis(config.killWindow);
      assert.isTrue(history.mayKill(config));
    }),
  );

  it("warm-up doubles with each recent kill", () => {
    const history = new BackendWatchdogKillHistory(() => 0);
    assert.strictEqual(Duration.toMillis(history.warmupFor(config)), 2_000);
    history.recordKill();
    history.recordKill();
    assert.strictEqual(Duration.toMillis(history.warmupFor(config)), 8_000);
  });

  it.effect("does nothing when disabled", () =>
    Effect.gen(function* () {
      const kills = yield* Ref.make(0);
      yield* runBackendHealthWatchdog({
        config: { ...config, enabled: false },
        history: new BackendWatchdogKillHistory(),
        probe: failingProbe,
        kill: Ref.update(kills, (n) => n + 1),
        log: () => Effect.void,
      });
      assert.strictEqual(yield* Ref.get(kills), 0);
    }),
  );
});

const busyLiveness: BackendLiveness = {
  record: () => Effect.void,
  assess: Effect.succeed({ kind: "busy", maxStallMs: 18_000 }),
};

const watchdogRun = (options: {
  readonly probe: Effect.Effect<void, BackendHealthProbeError>;
  readonly liveness: BackendLiveness;
}) =>
  Effect.gen(function* () {
    const kills = yield* Ref.make(0);
    const logs: Array<string> = [];
    const verdicts: Array<unknown> = [];
    const fiber = yield* Effect.forkChild(
      runBackendHealthWatchdog({
        config,
        history: new BackendWatchdogKillHistory(() => 0),
        ...options,
        kill: Ref.update(kills, (n) => n + 1),
        log: (message, details) =>
          Effect.sync(() => {
            logs.push(message);
            verdicts.push(details.liveness);
          }),
      }),
    );
    return { fiber, kills, logs, verdicts };
  });

describe("runBackendHealthWatchdog with a liveness beacon", () => {
  it.effect("kills a dead backend whose beacons stopped at the usual threshold", () =>
    Effect.gen(function* () {
      const liveness = yield* makeBackendLiveness();
      yield* liveness.record({ version: 1, stalledForMs: 0, maxStallMs: 40 });
      yield* TestClock.adjust(Duration.seconds(6));
      const { fiber, kills, logs, verdicts } = yield* watchdogRun({
        probe: failingProbe,
        liveness,
      });
      yield* TestClock.adjust(Duration.seconds(10));
      yield* Fiber.join(fiber);
      assert.strictEqual(yield* Ref.get(kills), 1);
      assert.strictEqual(logs.at(-1), "backend unresponsive; killing it so it restarts");
      assert.strictEqual(verdicts.at(-1), "frozen");
    }),
  );

  it.effect("does not kill a busy backend that recovers within the grace", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0);
      const probe = Ref.updateAndGet(calls, (n) => n + 1).pipe(
        Effect.flatMap((n) => (n <= 40 ? failingProbe : Effect.void)),
      );
      const { fiber, kills, logs } = yield* watchdogRun({ probe, liveness: busyLiveness });
      yield* TestClock.adjust(Duration.minutes(5));
      assert.strictEqual(yield* Ref.get(kills), 0);
      assert.deepStrictEqual(logs, ["backend not answering but busy; waiting before killing it"]);
      assert.isUndefined(fiber.pollUnsafe());
    }),
  );

  it.effect("kills a backend that stays busy past the grace", () =>
    Effect.gen(function* () {
      const { fiber, kills, logs } = yield* watchdogRun({
        probe: failingProbe,
        liveness: busyLiveness,
      });
      yield* TestClock.adjust(Duration.seconds(100));
      assert.strictEqual(yield* Ref.get(kills), 0);
      yield* TestClock.adjust(Duration.seconds(60));
      yield* Fiber.join(fiber);
      assert.strictEqual(yield* Ref.get(kills), 1);
      assert.strictEqual(
        logs.at(-1),
        "backend stayed busy past the watchdog's grace; killing it so it restarts",
      );
    }),
  );
});
