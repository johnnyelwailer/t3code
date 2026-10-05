/**
 * Codex app-server process teardown guarantees (GHE #326).
 *
 * The scoped release of a spawned app-server sends SIGTERM; without
 * `forceKillAfter` it waits one second and never escalates, so a wedged
 * `codex app-server` outlives its released session. The spawn command carries
 * `CODEX_APP_SERVER_FORCE_KILL_AFTER` (SIGKILL escalation), and
 * `spawnCodexAppServer` adds a survival check that runs after the spawner's own
 * release: a process still alive after SIGTERM + SIGKILL is logged
 * (`provider.codex.stop-process-survived`) and signalled once more, never
 * silently recorded as stopped.
 *
 * @module t3team-codexAppServerProcess
 */
import * as Effect from "effect/Effect";
import * as Scope from "effect/Scope";
import type { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export const CODEX_APP_SERVER_FORCE_KILL_AFTER = "2 seconds" as const;

/** `process.kill(pid, 0)` never signals: it succeeds while the process exists. */
export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

const reportSurvivor = (pid: number) =>
  Effect.gen(function* () {
    if (!isProcessAlive(pid)) return;
    yield* Effect.logError("provider.codex.stop-process-survived", { pid });
    yield* Effect.sync(() => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone between the probe and the signal.
      }
    });
  });

/**
 * Spawns the app-server in the ambient scope with a survival check registered
 * BEFORE the spawn, so (finalizers run last-in-first-out) it runs after the
 * spawner's terminate-and-escalate release.
 */
export const spawnCodexAppServer = <E, R>(
  spawn: (
    command: ChildProcess.Command,
  ) => Effect.Effect<ChildProcessSpawner.ChildProcessHandle, E, R | Scope.Scope>,
  command: ChildProcess.Command,
): Effect.Effect<ChildProcessSpawner.ChildProcessHandle, E, R | Scope.Scope> =>
  Effect.gen(function* () {
    let pid: number | undefined;
    yield* Effect.addFinalizer(() => (pid === undefined ? Effect.void : reportSurvivor(pid)));
    const handle = yield* spawn(command);
    pid = Number(handle.pid);
    return handle;
  });
