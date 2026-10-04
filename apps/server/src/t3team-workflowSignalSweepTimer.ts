// @effect-diagnostics globalTimers:off -- the signal-source timers own the subsystem's poll
// and sweep clocks; both cadences are injected through these two helpers and cleared by stop.
/**
 * The signal-source timers (GHE #332), split from the source/reconciler modules so the
 * recurring-timer plumbing lives in one plain (effect-free) module — the same shape the
 * workflow scheduler keeps for its own timers.
 */

export interface SignalSweepTimer {
  readonly stop: () => void;
}

/** Start the periodic sweep; `stop` clears the interval. */
export function startSignalSweep(sweep: () => Promise<void>, everyMs: number): SignalSweepTimer {
  const handle = setInterval(() => {
    void sweep().catch(() => {});
  }, everyMs);
  return {
    stop: () => clearInterval(handle),
  };
}

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
