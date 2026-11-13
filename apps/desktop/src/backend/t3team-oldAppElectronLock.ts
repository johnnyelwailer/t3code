// @effect-diagnostics nodeBuiltinImport:off - reads Chromium/Electron SingletonLock (hostname-pid) in the daily app's userData.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";

import { electronSingletonLockPath, type JoinPath } from "./t3team-oldAppPaths.ts";
import { isProcessAlive, isSelfPid } from "./t3team-oldAppProcess.ts";

export type ElectronLockInspection = {
  readonly userDataDir: string;
  readonly lockPath: string;
  readonly pid?: number;
  readonly pidAlive: boolean;
  readonly isSelf: boolean;
  /** A live pid that is not this process: the daily app (or another instance) holds the profile. */
  readonly running: boolean;
};

/** Chromium writes a symlink (or a file) whose target is `hostname-pid`. */
export function parseSingletonLockTarget(
  target: string,
  hostname = NodeOS.hostname(),
): number | undefined {
  const trimmed = target.trim();
  const prefix = `${hostname}-`;
  const body = trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
  // Some builds write only the pid; some write `hostname-pid`. Take the last integer token.
  const match = /(?:^|-)(\d+)$/.exec(body);
  if (match === null) return undefined;
  const pid = Number(match[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

export function inspectElectronSingletonLock(input: {
  readonly userDataDir: string;
  readonly join: JoinPath;
  readonly selfPids?: readonly number[];
  readonly isAlive?: (pid: number) => boolean;
  readonly hostname?: string;
}): ElectronLockInspection {
  const lockPath = electronSingletonLockPath(input.userDataDir, input.join);
  const selfPids = input.selfPids ?? [process.pid];
  const isAlive = input.isAlive ?? isProcessAlive;
  const empty: ElectronLockInspection = {
    userDataDir: input.userDataDir,
    lockPath,
    pidAlive: false,
    isSelf: false,
    running: false,
  };
  try {
    if (!NodeFS.lstatSync(lockPath)) return empty;
  } catch {
    return empty;
  }
  let target: string;
  try {
    const stat = NodeFS.lstatSync(lockPath);
    target = stat.isSymbolicLink()
      ? NodeFS.readlinkSync(lockPath)
      : NodeFS.readFileSync(lockPath, "utf8");
  } catch {
    return empty;
  }
  const pid = parseSingletonLockTarget(target, input.hostname ?? NodeOS.hostname());
  if (pid === undefined) return empty;
  const pidAlive = isAlive(pid);
  const isSelf = isSelfPid(pid, selfPids);
  return {
    userDataDir: input.userDataDir,
    lockPath,
    pid,
    pidAlive,
    isSelf,
    running: pidAlive && !isSelf,
  };
}

export function inspectOldAppElectronLocks(input: {
  readonly userDataDirs: readonly string[];
  readonly join: JoinPath;
  readonly selfPids?: readonly number[];
  readonly isAlive?: (pid: number) => boolean;
  readonly hostname?: string;
}): ElectronLockInspection[] {
  return input.userDataDirs.map((userDataDir) =>
    inspectElectronSingletonLock({
      userDataDir,
      join: input.join,
      ...(input.selfPids === undefined ? {} : { selfPids: input.selfPids }),
      ...(input.isAlive === undefined ? {} : { isAlive: input.isAlive }),
      ...(input.hostname === undefined ? {} : { hostname: input.hostname }),
    }),
  );
}
