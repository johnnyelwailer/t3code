// @effect-diagnostics nodeBuiltinImport:off - resolves realpath of candidate homes at startup.
/**
 * Conservative OR of lock, runtime pid, port 3773, and Electron SingletonLock.
 * A false negative (missing a live daily app) is treated as unacceptable.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { inspectOldAppElectronLocks, type ElectronLockInspection } from "./t3team-oldAppElectronLock.ts";
import { inspectHomeLock, type HomeLockInspection } from "./t3team-oldAppLock.ts";
import {
  appDataDirectoryForPlatform,
  legacyT3Home,
  oldAppUserDataDirs,
  type JoinPath,
} from "./t3team-oldAppPaths.ts";
import { probeOldNexiPort, type PortProbeResult } from "./t3team-oldAppPort.ts";

export type OldAppSignal =
  | "ownership-lock"
  | "runtime-pid"
  | "backend-port"
  | "electron-lock";

export type OldAppPresence = {
  readonly running: boolean;
  readonly signals: readonly OldAppSignal[];
  readonly homes: readonly HomeLockInspection[];
  readonly port: PortProbeResult;
  readonly electronLocks: readonly ElectronLockInspection[];
  readonly cleanedStaleRuntime: boolean;
};

export type DetectOldAppInput = {
  readonly homes: readonly string[];
  readonly join?: JoinPath;
  readonly selfPids?: readonly number[];
  readonly isAlive?: (pid: number) => boolean;
  readonly userDataDirs?: readonly string[];
  readonly probePort?: () => Promise<PortProbeResult>;
  readonly hostname?: string;
  /** Skip the network probe (sync-only early path). Defaults to probing. */
  readonly skipPort?: boolean;
};

const realHome = (home: string): string => {
  try {
    return NodeFS.realpathSync(home);
  } catch {
    return home;
  }
};

function uniqueHomes(homes: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const home of homes) {
    if (home.trim().length === 0) continue;
    const key = realHome(home);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(home);
  }
  return result;
}

const signalsFrom = (input: {
  homes: readonly HomeLockInspection[];
  port: PortProbeResult;
  electronLocks: readonly ElectronLockInspection[];
}): OldAppSignal[] => {
  const signals: OldAppSignal[] = [];
  if (input.homes.some((home) => home.lock === "held")) signals.push("ownership-lock");
  if (input.homes.some((home) => home.runtimePidAlive && !home.runtimeIsSelf && home.lock !== "held")) {
    // Live pre-lock server: runtime pid only counts when the exclusive lock is not already the signal.
    signals.push("runtime-pid");
  }
  if (input.homes.some((home) => home.runtimePidAlive && !home.runtimeIsSelf && home.lock === "held")) {
    // Pid confirms the holder is not us; the lock already recorded the signal.
  }
  if (input.port.kind === "identified") signals.push("backend-port");
  if (input.electronLocks.some((lock) => lock.running)) signals.push("electron-lock");
  // A held lock with a live self pid would be this process — ignore self.
  // A held lock is always "another process" during first-launch detect (we do not hold it).
  return signals;
};

export async function detectOldApp(input: DetectOldAppInput): Promise<OldAppPresence> {
  const join = input.join ?? NodePath.join;
  const homes = uniqueHomes(input.homes).map((home) =>
    inspectHomeLock({
      home,
      join,
      ...(input.selfPids === undefined ? {} : { selfPids: input.selfPids }),
      ...(input.isAlive === undefined ? {} : { isAlive: input.isAlive }),
    }),
  );
  const electronLocks =
    input.userDataDirs === undefined || input.userDataDirs.length === 0
      ? []
      : inspectOldAppElectronLocks({
          userDataDirs: input.userDataDirs,
          join,
          ...(input.selfPids === undefined ? {} : { selfPids: input.selfPids }),
          ...(input.isAlive === undefined ? {} : { isAlive: input.isAlive }),
          ...(input.hostname === undefined ? {} : { hostname: input.hostname }),
        });
  const port: PortProbeResult = input.skipPort
    ? { kind: "not-listening" }
    : await (input.probePort ?? probeOldNexiPort)();
  const signals = signalsFrom({ homes, port, electronLocks });
  return {
    running: signals.length > 0,
    signals,
    homes,
    port,
    electronLocks,
    cleanedStaleRuntime: homes.some((home) => home.cleanedStaleRuntime),
  };
}

/** Sync subset (lock, pid, Electron) for the early user-data path. */
export function detectOldAppSync(input: Omit<DetectOldAppInput, "probePort" | "skipPort">): OldAppPresence {
  const join = input.join ?? NodePath.join;
  const homes = uniqueHomes(input.homes).map((home) =>
    inspectHomeLock({
      home,
      join,
      ...(input.selfPids === undefined ? {} : { selfPids: input.selfPids }),
      ...(input.isAlive === undefined ? {} : { isAlive: input.isAlive }),
    }),
  );
  const electronLocks =
    input.userDataDirs === undefined || input.userDataDirs.length === 0
      ? []
      : inspectOldAppElectronLocks({
          userDataDirs: input.userDataDirs,
          join,
          ...(input.selfPids === undefined ? {} : { selfPids: input.selfPids }),
          ...(input.isAlive === undefined ? {} : { isAlive: input.isAlive }),
          ...(input.hostname === undefined ? {} : { hostname: input.hostname }),
        });
  const port: PortProbeResult = { kind: "not-listening" };
  const signals = signalsFrom({ homes, port, electronLocks });
  return {
    running: signals.length > 0,
    signals,
    homes,
    port,
    electronLocks,
    cleanedStaleRuntime: homes.some((home) => home.cleanedStaleRuntime),
  };
}

export function homesToScan(input: {
  readonly brandedHome: string;
  readonly homeDirectory: string;
  readonly join?: JoinPath;
}): string[] {
  const join = input.join ?? NodePath.join;
  return uniqueHomes([input.brandedHome, legacyT3Home(input.homeDirectory, join)]);
}

export function userDataDirsToScan(input: {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
  readonly join?: JoinPath;
  readonly appDataDirectory?: string;
  readonly extraNames?: readonly string[];
  readonly xdgConfigHome?: string;
}): string[] {
  const join = input.join ?? NodePath.join;
  const appData =
    input.appDataDirectory ??
    appDataDirectoryForPlatform({
      platform: input.platform,
      homeDirectory: input.homeDirectory,
      join,
      ...(input.xdgConfigHome === undefined ? {} : { xdgConfigHome: input.xdgConfigHome }),
    });
  return oldAppUserDataDirs({
    appDataDirectory: appData,
    join,
    ...(input.extraNames === undefined ? {} : { extraNames: input.extraNames }),
  });
}
