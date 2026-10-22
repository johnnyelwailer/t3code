import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import type * as Scope from "effect/Scope";

import * as Electron from "electron";

import { makeComponentLogger } from "./DesktopObservability.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronPowerMonitor from "../electron/ElectronPowerMonitor.ts";

/**
 * Chromium keeps renderer localStorage writes in memory and commits them to
 * LevelDB lazily. A forced stop (installer, task kill, crash, power loss) drops
 * whatever was not committed yet, which is how unsent composer drafts got lost
 * across restarts. Flush the renderer storage of the app's session(s):
 *   - on a short interval while the app runs (bounds loss to ~interval),
 *   - on `before-quit` / updater quit (windows are `destroy()`ed right after,
 *     which skips the renderer's own `beforeunload` flush),
 *   - before the OS suspends or locks the session.
 */
const { logWarning } = makeComponentLogger("desktop-storage-flush");

export const DESKTOP_STORAGE_FLUSH_INTERVAL = Duration.seconds(2);

export interface DesktopStorageFlushTarget {
  readonly flushStorageData: () => void;
}

/** Flushes every target, isolating failures so one bad session cannot block the rest. */
export function flushDesktopStorageTargets(
  targets: Iterable<DesktopStorageFlushTarget>,
  onError: (error: unknown) => void = () => {},
): void {
  for (const target of targets) {
    try {
      target.flushStorageData();
    } catch (error) {
      onError(error);
    }
  }
}

/** The main window renders from the default session (no partition). */
export const defaultDesktopStorageFlushTargets = (): Array<DesktopStorageFlushTarget> => [
  Electron.session.defaultSession,
];

export const registerDesktopStorageFlush = Effect.fn("desktop.t3team.storageFlush.register")(
  function* (
    getTargets: () => Iterable<DesktopStorageFlushTarget> = defaultDesktopStorageFlushTargets,
    interval: Duration.Input = DESKTOP_STORAGE_FLUSH_INTERVAL,
  ): Effect.fn.Return<
    void,
    never,
    Scope.Scope | ElectronApp.ElectronApp | ElectronPowerMonitor.ElectronPowerMonitor
  > {
    const electronApp = yield* ElectronApp.ElectronApp;
    const powerMonitor = yield* ElectronPowerMonitor.ElectronPowerMonitor;
    const flushEffect = Effect.suspend(() => {
      const errors: Array<unknown> = [];
      flushDesktopStorageTargets(getTargets(), (error) => errors.push(error));
      return errors.length === 0
        ? Effect.void
        : logWarning("renderer storage flush failed", { errors: errors.map(String) });
    });
    const context = yield* Effect.context<never>();
    // Electron listeners are synchronous; the flush must run before they return.
    const flush = () => Effect.runSyncWith(context)(flushEffect);
    yield* electronApp.on("before-quit", flush);
    yield* electronApp.onBeforeQuitForUpdate(flush);
    yield* powerMonitor.onSimpleEvent("suspend", flush);
    yield* powerMonitor.onSimpleEvent("lock-screen", flush);
    yield* flushEffect.pipe(Effect.repeat(Schedule.spaced(interval)), Effect.forkScoped);
  },
);
