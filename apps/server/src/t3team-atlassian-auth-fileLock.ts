// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalRandom:off globalTimers:off preferSchemaOverJson:off - the cross-process lock must use real OS time, pids and exclusive file creation, outside the TestClock.
import * as NodeFS from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";

import { ServerConfig } from "./config.ts";

/**
 * Cross-process lock around the persisted Atlassian secret.
 *
 * The in-process semaphore only serializes one server. Two servers on one T3 home (a second app
 * instance, a leftover dev server) could both read the same single-use refresh token, both redeem
 * it, and the loser flagged the account "needs reconnect" for good. This lock file in the secrets
 * directory makes reload -> refresh -> save one critical section across processes.
 *
 * The lock is advisory and best-effort: a lock held by a dead process, or older than
 * `STALE_LOCK_MS`, is taken over, and if it still can not be acquired after `ACQUIRE_TIMEOUT_MS`
 * the critical section runs anyway (with a warning) so a stuck file never blocks Jira entirely.
 */
export const ATLASSIAN_AUTH_LOCK_FILE = "t3team-atlassian-auths.lock";
const STALE_LOCK_MS = 60_000;
const ACQUIRE_TIMEOUT_MS = 65_000;
const RETRY_MS = 50;

type LockOwner = { readonly pid: number; readonly host: string; readonly at: number };

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readOwner(lockPath: string): Promise<LockOwner | null> {
  try {
    return JSON.parse(await NodeFS.readFile(lockPath, "utf8")) as LockOwner;
  } catch {
    return null;
  }
}

/** True when the lock file at `lockPath` may be taken over. Exported for tests. */
export async function isAtlassianAuthLockStale(lockPath: string, now = Date.now()) {
  const stat = await NodeFS.stat(lockPath).catch(() => null);
  if (!stat) return true;
  if (now - stat.mtimeMs > STALE_LOCK_MS) return true;
  const owner = await readOwner(lockPath);
  // Unreadable (half-written) owner: only stale once it is old, handled above.
  if (!owner || typeof owner.pid !== "number") return false;
  if (owner.host === NodeOS.hostname() && !processAlive(owner.pid)) return true;
  return false;
}

/** Try to create the lock once. Resolves to a release function, or null when it is held. */
export async function tryAcquireAtlassianAuthLock(
  lockPath: string,
): Promise<(() => Promise<void>) | null> {
  const token = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  const owner = { pid: process.pid, host: NodeOS.hostname(), at: Date.now(), token };
  try {
    await NodeFS.writeFile(lockPath, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    if (!(await isAtlassianAuthLockStale(lockPath))) return null;
    // Take over a stale lock: rename it away atomically so only one contender wins the removal.
    const stalePath = `${lockPath}.${token}.stale`;
    try {
      await NodeFS.rename(lockPath, stalePath);
      await NodeFS.rm(stalePath, { force: true });
    } catch {
      return null;
    }
    return tryAcquireAtlassianAuthLock(lockPath);
  }
  return async () => {
    const current = (await readOwner(lockPath)) as (LockOwner & { token?: string }) | null;
    // Never remove a lock some other process took over after ours went stale.
    if (current?.token === token) await NodeFS.rm(lockPath, { force: true }).catch(() => {});
  };
}

async function acquireWithRetry(lockPath: string) {
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  for (;;) {
    const release = await tryAcquireAtlassianAuthLock(lockPath).catch(() => null);
    if (release) return { release, acquired: true as const };
    if (Date.now() >= deadline) return { release: async () => {}, acquired: false as const };
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
}

/** Run `effect` while holding the cross-process Atlassian secret lock. */
export function withAtlassianAuthFileLock<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | ServerConfig> {
  return Effect.gen(function* () {
    const { secretsDir } = yield* ServerConfig;
    const lockPath = NodePath.join(secretsDir, ATLASSIAN_AUTH_LOCK_FILE);
    yield* Effect.promise(() => NodeFS.mkdir(secretsDir, { recursive: true }).catch(() => {}));
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => acquireWithRetry(lockPath)).pipe(
        Effect.tap(({ acquired }) =>
          acquired
            ? Effect.void
            : Effect.logWarning(
                "Atlassian auth lock not acquired in time; continuing without it.",
              ).pipe(Effect.annotateLogs({ lockPath })),
        ),
      ),
      () => effect,
      ({ release }) => Effect.promise(release),
    );
  });
}
