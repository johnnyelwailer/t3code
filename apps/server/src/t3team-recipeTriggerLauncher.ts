/**
 * The durable half of a recipe-trigger launch (S5b). The engine has already CLAIMED the launch —
 * consumed the key's inbox slots and written a `pending` ledger row in one transaction — so this
 * module only has to get that row to `launched` exactly once:
 *
 *   • the run id IS the ledger's launch id, and the row turns `launched` the moment the run row is
 *     durable (`onAdmitted`). A retry that finds the run already exists marks the row and stops, so
 *     a crash between admission and that mark never launches twice;
 *   • a launch that fails before admission is retried with backoff and settles as `failed` after
 *     `TRIGGER_LAUNCH_MAX_ATTEMPTS`, where diagnostics show its last error;
 *   • a crash before admission leaves the row `pending` and due, so the next drain launches it.
 *
 * In-process, one launch id is driven by at most one attempt at a time (`launching`).
 */
import type { RecipeTriggerLaunchRequest } from "./t3team-recipeTriggerRunnerCoreTypes.ts";

export const TRIGGER_LAUNCH_MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;
const DUE_BATCH = 25;

export interface RecipeTriggerLauncherPorts {
  readonly nowMs: () => number;
  readonly markLaunched: (launchId: string, launchedAtMs: number) => Promise<void>;
  readonly markAttemptFailed: (input: {
    readonly launchId: string;
    readonly error: string;
    readonly nextAttemptAtMs: number;
    readonly giveUp: boolean;
  }) => Promise<void>;
  readonly listDue: (
    nowMs: number,
    limit: number,
  ) => Promise<
    ReadonlyArray<{ readonly request: RecipeTriggerLaunchRequest; readonly attempts: number }>
  >;
  readonly runExists: (runId: string) => Promise<boolean>;
  /** Launch the run under `request.launchId`; call `onAdmitted` once its run row is durable. */
  readonly start: (
    request: RecipeTriggerLaunchRequest,
    onAdmitted: () => Promise<void>,
  ) => Promise<void>;
  readonly log: (message: string, fields?: unknown) => void;
}

export function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempts);
}

export function makeRecipeTriggerLauncher(ports: RecipeTriggerLauncherPorts) {
  const launching = new Set<string>();

  const attempt = async (request: RecipeTriggerLaunchRequest, attempts: number) => {
    let admitted = false;
    const markLaunched = async () => {
      if (admitted) return;
      admitted = true;
      await ports.markLaunched(request.launchId, ports.nowMs());
    };
    try {
      if (await ports.runExists(request.launchId)) return await markLaunched();
      await ports.start(request, markLaunched);
      await markLaunched();
    } catch (error) {
      ports.log("trigger launch failed", {
        recipe: request.recipeId,
        trigger: request.triggerId,
        key: request.key,
        admitted,
        error: String(error),
      });
      // An admitted run owns its own failure; only a launch that never got a run row retries.
      if (admitted) return;
      const giveUp = attempts + 1 >= TRIGGER_LAUNCH_MAX_ATTEMPTS;
      await ports
        .markAttemptFailed({
          launchId: request.launchId,
          error: String(error),
          nextAttemptAtMs: ports.nowMs() + retryDelayMs(attempts),
          giveUp,
        })
        .catch((markError) =>
          ports.log("trigger launch failure could not be recorded", { error: String(markError) }),
        );
    }
  };

  /** Drive one launch; resolves when this attempt settled (or immediately, if one is running). */
  const launch = async (request: RecipeTriggerLaunchRequest, attempts = 0): Promise<void> => {
    if (launching.has(request.launchId)) return;
    launching.add(request.launchId);
    try {
      await attempt(request, attempts);
    } finally {
      launching.delete(request.launchId);
    }
  };

  /** Re-drive every pending launch whose retry is due: failed attempts and crash leftovers. */
  const retryDue = async (): Promise<void> => {
    const due = await ports.listDue(ports.nowMs(), DUE_BATCH);
    await Promise.all(due.map((row) => launch(row.request, row.attempts)));
  };

  return { launch, retryDue, isLaunching: (launchId: string) => launching.has(launchId) };
}

export type RecipeTriggerLauncher = ReturnType<typeof makeRecipeTriggerLauncher>;
