/**
 * Watching a handoff successor on its target environment's thread shells: waiting for its first
 * run to go live, and stopping it when that never happens.
 */
import { successorRunState } from "@t3tools/client-runtime/state/thread-handoff";
import type { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { environmentThreadShells } from "~/state/threads";

/**
 * How long the successor may take to go live, by stage. `preparing` covers fetch, checkout and
 * the project's setup script — often a full dependency install — so it gets 10 minutes from
 * launch. Once preparation is done the provider turn only has to start, so it gets 2 minutes
 * from the moment the run left `preparing` (or from launch, when there was nothing to prepare).
 */
export const SUCCESSOR_LIVE_BOUNDS = { preparingMs: 600_000, startingMs: 120_000 };

const successorShell = (environmentId: EnvironmentId, threadId: ThreadId) =>
  appAtomRegistry
    .get(environmentThreadShells.environmentThreadIndexAtom(environmentId))
    .get(threadId);

/** Resolves once the successor thread's first run is live on its environment. */
export function awaitSuccessorLive(
  environmentId: EnvironmentId,
  threadId: ThreadId,
  bounds = SUCCESSOR_LIVE_BOUNDS,
): Promise<void> {
  const indexAtom = environmentThreadShells.environmentThreadIndexAtom(environmentId);
  const launchedAt = Date.now();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let preparing: boolean | undefined;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    let unsubscribe = () => {};
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      unsubscribe();
      if (error === undefined) resolve();
      else reject(error);
    };
    const arm = (deadline: number, message: string) => {
      globalThis.clearTimeout(timeout);
      timeout = globalThis.setTimeout(
        () => finish(new Error(message)),
        Math.max(0, deadline - Date.now()),
      );
    };
    const inspect = () => {
      const shell = appAtomRegistry.get(indexAtom).get(threadId);
      const state = successorRunState(shell);
      if (state === "live") return finish();
      if (state === "failed") return finish(new Error("The new thread's first run did not start."));
      const nowPreparing = shell?.status === "preparing";
      if (nowPreparing === preparing) return;
      preparing = nowPreparing;
      if (nowPreparing) {
        arm(launchedAt + bounds.preparingMs, "The new thread was still preparing its workspace.");
      } else {
        arm(Date.now() + bounds.startingMs, "The new thread did not start in time.");
      }
    };
    unsubscribe = appAtomRegistry.subscribe(indexAtom, inspect);
    inspect();
  });
}

/**
 * Best-effort stop of a successor that did not go live: interrupts its first run, which also
 * ends it mid-preparation (`run.interrupt` → "Workspace preparation interrupted"). Resolves
 * `true` once nothing of it can still start, `false` when the run is not visible here yet.
 */
export async function stopSuccessor(
  environmentId: EnvironmentId,
  threadId: ThreadId,
  interrupt: (runId: RunId) => Promise<void>,
): Promise<boolean> {
  const shell = successorShell(environmentId, threadId);
  if (shell === undefined || shell.latestRunId === null) return false;
  if (successorRunState(shell) === "failed") return true;
  await interrupt(shell.latestRunId);
  return true;
}
