import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { vi } from "vite-plus/test";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronPowerMonitor from "../electron/ElectronPowerMonitor.ts";
import {
  defaultDesktopStorageFlushTargets,
  flushDesktopStorageTargets,
  registerDesktopStorageFlush,
} from "./t3team-DesktopStorageFlush.ts";

const { defaultSession } = vi.hoisted(() => ({ defaultSession: { flushStorageData: vi.fn() } }));
vi.mock("electron", () => ({ session: { defaultSession } }));

type Listener = () => void;

function makeLayers(listeners: Map<string, Listener>) {
  const register = (eventName: string, listener: Listener) =>
    Effect.acquireRelease(
      Effect.sync(() => void listeners.set(eventName, listener)),
      () => Effect.sync(() => void listeners.delete(eventName)),
    ).pipe(Effect.asVoid);
  const app = Layer.succeed(ElectronApp.ElectronApp, {
    on: (eventName: string, listener: Listener) => register(eventName, listener),
    onBeforeQuitForUpdate: (listener: Listener) => register("before-quit-for-update", listener),
  } as unknown as ElectronApp.ElectronApp["Service"]);
  const power = Layer.succeed(ElectronPowerMonitor.ElectronPowerMonitor, {
    onSimpleEvent: (eventName: string, listener: Listener) =>
      register(`power:${eventName}`, listener),
  } as unknown as ElectronPowerMonitor.ElectronPowerMonitor["Service"]);
  return Layer.merge(app, power);
}

describe("flushDesktopStorageTargets", () => {
  it("flushes every target even when one throws", () => {
    const calls: Array<string> = [];
    const errors: Array<unknown> = [];
    flushDesktopStorageTargets(
      [
        { flushStorageData: () => calls.push("a") },
        {
          flushStorageData: () => {
            throw new Error("boom");
          },
        },
        { flushStorageData: () => calls.push("c") },
      ],
      (error) => errors.push(error),
    );
    assert.deepEqual(calls, ["a", "c"]);
    assert.equal(errors.length, 1);
  });

  it("targets the default session the main window renders from", () => {
    assert.deepEqual(defaultDesktopStorageFlushTargets(), [defaultSession]);
  });
});

describe("registerDesktopStorageFlush", () => {
  it.effect("flushes on quit, updater quit, suspend, lock and on an interval", () => {
    const listeners = new Map<string, Listener>();
    return Effect.gen(function* () {
      let flushes = 0;
      const target = { flushStorageData: () => void flushes++ };
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* registerDesktopStorageFlush(() => [target], "2 seconds");
          yield* Effect.yieldNow;
          const afterStart = flushes;
          assert.isAtLeast(afterStart, 1);

          for (const eventName of [
            "before-quit",
            "before-quit-for-update",
            "power:suspend",
            "power:lock-screen",
          ]) {
            listeners.get(eventName)?.();
          }
          assert.equal(flushes, afterStart + 4);

          yield* TestClock.adjust("4 seconds");
          assert.isAtLeast(flushes, afterStart + 6);
        }),
      );
      // Scope closed: listeners are removed and the interval stops.
      assert.equal(listeners.size, 0);
      const settled = flushes;
      yield* TestClock.adjust("10 seconds");
      assert.equal(flushes, settled);
    }).pipe(Effect.provide(makeLayers(listeners)));
  });
});
