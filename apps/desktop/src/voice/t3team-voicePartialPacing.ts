/** Partials come at most this often; a slow pass stretches the gap (see `nextGapMs`). */
const PARTIAL_INTERVAL_MS = 2_000;
/**
 * A partial whose pass (worker time only, never time spent waiting for a cold model) took longer
 * than this is slow: stale text is worthless and a busy worker delays the final pass. One slow pass
 * backs partials off; only this many in a row end them for the session.
 */
export const PARTIAL_BUDGET_MS = 8_000;
const SLOW_PARTIALS_BEFORE_OFF = 3;

/**
 * How often a session's partials run. Judged on the worker's pass time; while the worker is still
 * warming up, partials wait (logged once per wait) instead of queueing behind the load.
 */
export function createPartialPacing(deps: {
  readonly log: (message: string) => void;
  readonly isWorkerReady: () => boolean;
}) {
  let lastPassMs = 0;
  let slowInARow = 0;
  let enabled = true;
  let waiting = false;
  return {
    get enabled() {
      return enabled;
    },
    /** A slow pass doubles the gap, so a struggling worker gets room for the final pass. */
    nextGapMs: () => Math.max(PARTIAL_INTERVAL_MS, lastPassMs * (slowInARow > 0 ? 2 : 1)),
    /** A new utterance starts at the normal cadence. */
    resetGap: () => {
      lastPassMs = 0;
    },
    record(passMs: number) {
      lastPassMs = passMs;
      if (passMs <= PARTIAL_BUDGET_MS) {
        slowInARow = 0;
        return;
      }
      slowInARow += 1;
      if (slowInARow >= SLOW_PARTIALS_BEFORE_OFF) enabled = false;
      deps.log(
        enabled
          ? `stream partial slow: pass took ${passMs} ms (budget ${PARTIAL_BUDGET_MS} ms); backing off`
          : `stream partials off: ${slowInARow} passes in a row over ${PARTIAL_BUDGET_MS} ms`,
      );
    },
    /** True when the worker can take a partial now; logs the start and end of a warm-up wait. */
    workerReady(audioMs: number): boolean {
      if (deps.isWorkerReady()) {
        if (waiting) deps.log(`stream worker ready at ${Math.round(audioMs)} ms of audio`);
        waiting = false;
        return true;
      }
      if (!waiting) deps.log(`stream partials waiting for the whisper worker to warm up`);
      waiting = true;
      return false;
    },
  };
}
