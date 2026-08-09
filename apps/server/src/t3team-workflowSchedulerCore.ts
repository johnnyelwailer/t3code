// @effect-diagnostics globalTimers:off -- the scheduler owns a single host timer (injectable
// for tests) armed for the soonest deadline; only it touches the real clock.
/**
 * The scheduler's own logic: indexing durable wake deadlines into ONE process timer, arming it
 * for the soonest, and re-arming after each fire.
 *
 * Split from `t3team-workflowScheduler.ts` so this sits apart from the Effect service that
 * publishes it. Deliberately holds NO reference to the service tag — an earlier attempt put the
 * Layer here instead, which made the two modules cyclic and left the tag undefined at layer
 * construction (`Cannot read properties of undefined (reading 'key')`). Depending only downward
 * keeps that impossible.
 */

import * as DateTime from "effect/DateTime";

const MIN_DUE_DELAY_MS = 1000;

/** One sleeping run as the scheduler indexes it: which run, its `waitUntil` correlation to
 * resolve, and its wake instant (epoch millis). */
export interface SchedulerSleepingRun {
  readonly runId: string;
  readonly correlationId: string;
  readonly wakeAtMs: number;
}

/** The wall clock + timer the scheduler drives. Injectable so a test can fire deadlines
 * deterministically instead of waiting on real time. */
export interface WorkflowSchedulerClock {
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

export interface WorkflowSchedulerDeps {
  /** All runs currently parked on a timer (status `sleeping`), with their wake instant. */
  readonly listSleeping: () => Promise<ReadonlyArray<SchedulerSleepingRun>>;
  /** Resume a due run by resolving its `waitUntil` correlation — the reactor's resume path,
   * clock-triggered. A no-op if the run is not registered (it must be rehydrated first). */
  readonly resume: (runId: string, correlationId: string) => Promise<void>;
  readonly clock?: WorkflowSchedulerClock;
  readonly onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface WorkflowScheduler {
  /** Recompute the soonest pending deadline and (re)arm the single process timer for it.
   * Called on boot (after rehydration) and whenever a run parks or wakes. */
  readonly rearm: () => Promise<void>;
  /** Clear the armed timer (shutdown). */
  readonly stop: () => void;
}

const defaultClock: WorkflowSchedulerClock = {
  now: () => DateTime.nowUnsafe().epochMilliseconds,
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Build a scheduler over its deps. Pure of any Effect context, so a test can drive the real
 * arm/fire/re-arm loop with an injected clock; {@link T3TeamWorkflowSchedulerLive} wraps this
 * over the live repo + registry.
 */
export function makeWorkflowScheduler(deps: WorkflowSchedulerDeps): WorkflowScheduler {
  const clock = deps.clock ?? defaultClock;
  let timer: unknown;
  let stopped = false;
  let rearmTail: Promise<void> = Promise.resolve();

  const clear = (): void => {
    if (timer !== undefined) {
      clock.clearTimer(timer);
      timer = undefined;
    }
  };

  // The timer callback. Self-contained on errors (a real host timer ignores the returned
  // promise, so nothing else can catch a rejection) — listSleeping/resume/re-arm failures are
  // logged, never thrown. Returns a promise so a test clock can await the full fire→resume→arm.
  const tick = async (): Promise<void> => {
    timer = undefined;
    try {
      const rows = await deps.listSleeping();
      const nowMs = clock.now();
      // Fire only the genuinely-due deadlines. A timer that fired a hair early leaves the run for
      // the next arm (the re-arm below computes its small remaining delay) — self-correcting.
      const due = rows.filter((run) => run.wakeAtMs <= nowMs);
      // Let every due run claim its fair admission position before awaiting settlement. A slow
      // first run must not prevent later due runs from even entering the admission queue.
      await Promise.all(
        due.map(async (run) => {
          try {
            await deps.resume(run.runId, run.correlationId);
          } catch (error) {
            deps.onWarn?.("workflow scheduler failed to resume a sleeping run", {
              runId: run.runId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
      await rearm();
    } catch (error) {
      deps.onWarn?.("workflow scheduler tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const performRearm = async (): Promise<void> => {
    const rows = await deps.listSleeping();
    if (stopped) return;
    clear();
    if (rows.length === 0) return;
    const soonest = Math.min(...rows.map((run) => run.wakeAtMs));
    // An already-due deadline arms at the floor, never 0 — see MIN_DUE_DELAY_MS (loop guard). A
    // future deadline arms at its exact remaining delay.
    const remaining = soonest - clock.now();
    const delayMs = remaining <= 0 ? MIN_DUE_DELAY_MS : remaining;
    timer = clock.setTimer(tick, delayMs);
  };

  // Serialize DB reads + timer replacement. Without this lane, an older slow listSleeping()
  // result can arrive after a newer one and replace the correct timer with a stale deadline.
  const rearm = (): Promise<void> => {
    const next = rearmTail.then(performRearm, performRearm);
    rearmTail = next.catch(() => undefined);
    return next;
  };

  return {
    rearm,
    stop: () => {
      stopped = true;
      clear();
    },
  };
}

/** Map a sleeping `workflow_runs` row to the scheduler's index shape, or `undefined` if it is
 * missing the deadline / correlation a timer wake needs (logged + skipped by the caller). */
export function toSchedulerSleepingRun(row: {
  readonly runId: string;
  readonly wakeAt: string | null;
  readonly pendingCorrelationId: string | null;
}): SchedulerSleepingRun | undefined {
  if (row.wakeAt === null || row.pendingCorrelationId === null) return undefined;
  return {
    runId: row.runId,
    correlationId: row.pendingCorrelationId,
    wakeAtMs: DateTime.makeUnsafe(row.wakeAt).epochMilliseconds,
  };
}
