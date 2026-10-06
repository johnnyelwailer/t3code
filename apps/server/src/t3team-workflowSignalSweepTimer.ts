// @effect-diagnostics globalTimers:off -- a signal source instance owns its own poll cadence:
// the timer is created when the instance starts and cleared by its stop.
/**
 * The per-instance poll timer of a signal source (GHE #332), split from the source modules so the
 * timer plumbing lives in one plain (effect-free) module. The reconciler's periodic sweep is not
 * here: it runs on the server's due-work `Scheduler` (t3team-workflowSignalReconciler.ts).
 */

/** A reschedulable poll timer: `schedule` (re)places the pending tick; `stop` clears it.
 * The source's `tick` re-schedules itself on each iteration through `schedule`. */
export function makeSignalPollTimer(): {
  readonly schedule: (tick: () => void, ms: number) => void;
  readonly stop: () => void;
} {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule: (tick, ms) => {
      if (handle !== undefined) clearTimeout(handle);
      handle = setTimeout(() => {
        handle = undefined;
        tick();
      }, ms);
    },
    stop: () => {
      if (handle !== undefined) clearTimeout(handle);
      handle = undefined;
    },
  };
}
