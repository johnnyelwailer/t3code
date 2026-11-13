// @effect-diagnostics nodeBuiltinImport:off - inspects the shared-home ownership lock and runtime pid file at startup, without Effect.
import * as NodeFS from "node:fs";
import * as NodeSqlite from "node:sqlite";

import { isProcessAlive, isSelfPid } from "./t3team-oldAppProcess.ts";
import {
  serverOwnerLockPath,
  serverRuntimeStatePath,
  type JoinPath,
} from "./t3team-oldAppPaths.ts";

export type OwnershipLockState = "held" | "free" | "missing" | "error";

export type RuntimeStateInfo = {
  readonly pid: number;
  readonly port?: number;
  readonly startedAt?: string;
  readonly origin?: string;
};

const isSqliteBusy = (cause: unknown): boolean => {
  if (!(cause instanceof Error)) return false;
  const err = cause as Error & { errcode?: number; code?: string };
  return err.errcode === 5 || err.code === "SQLITE_BUSY" || /database is locked/i.test(err.message);
};

/**
 * Probe `server-owner.sqlite` without keeping the exclusive transaction. A held lock means
 * a live server (the OS releases it on exit, including SIGKILL). A free file is not running.
 */
export function inspectOwnershipLock(lockPath: string): OwnershipLockState {
  if (!NodeFS.existsSync(lockPath)) return "missing";
  let db: NodeSqlite.DatabaseSync | undefined;
  try {
    db = new NodeSqlite.DatabaseSync(lockPath);
    db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;");
    try {
      db.exec("ROLLBACK;");
    } catch {
      // Closing drops a leftover transaction.
    }
    return "free";
  } catch (cause) {
    return isSqliteBusy(cause) ? "held" : "error";
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

export function readRuntimeState(statePath: string): RuntimeStateInfo | undefined {
  try {
    if (!NodeFS.existsSync(statePath)) return undefined;
    const raw = NodeFS.readFileSync(statePath, "utf8").trim();
    if (raw.length === 0) return undefined;
    const parsed = JSON.parse(raw) as {
      pid?: unknown;
      port?: unknown;
      startedAt?: unknown;
      origin?: unknown;
    };
    if (!Number.isInteger(parsed.pid) || (parsed.pid as number) <= 0) return undefined;
    return {
      pid: parsed.pid as number,
      ...(typeof parsed.port === "number" ? { port: parsed.port } : {}),
      ...(typeof parsed.startedAt === "string" ? { startedAt: parsed.startedAt } : {}),
      ...(typeof parsed.origin === "string" ? { origin: parsed.origin } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Clear leftover runtime state only when the pid is dead and the ownership lock is not held. */
function clearStaleRuntimeState(statePath: string): boolean {
  try {
    if (!NodeFS.existsSync(statePath)) return false;
    NodeFS.rmSync(statePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

export type HomeLockInspection = {
  readonly home: string;
  readonly lock: OwnershipLockState;
  readonly runtime?: RuntimeStateInfo | undefined;
  readonly runtimePidAlive: boolean;
  readonly runtimeIsSelf: boolean;
  readonly cleanedStaleRuntime: boolean;
};

export function inspectHomeLock(input: {
  readonly home: string;
  readonly join: JoinPath;
  readonly selfPids?: readonly number[];
  readonly isAlive?: (pid: number) => boolean;
}): HomeLockInspection {
  const join = input.join;
  const selfPids = input.selfPids ?? [process.pid];
  const isAlive = input.isAlive ?? isProcessAlive;
  const lock = inspectOwnershipLock(serverOwnerLockPath(input.home, join));
  const runtime = readRuntimeState(serverRuntimeStatePath(input.home, join));
  const runtimePidAlive = runtime !== undefined && isAlive(runtime.pid);
  const runtimeIsSelf = runtime !== undefined && isSelfPid(runtime.pid, selfPids);
  let cleanedStaleRuntime = false;
  // Lock free/missing and a dead (or absent) pid: the leftover record is provably stale.
  if (lock !== "held" && runtime !== undefined && !runtimePidAlive && !runtimeIsSelf) {
    cleanedStaleRuntime = clearStaleRuntimeState(serverRuntimeStatePath(input.home, join));
  }
  return {
    home: input.home,
    lock,
    runtime,
    runtimePidAlive,
    runtimeIsSelf,
    cleanedStaleRuntime,
  };
}
