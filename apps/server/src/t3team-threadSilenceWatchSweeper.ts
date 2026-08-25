// @effect-diagnostics globalTimers:off -- the sweeper owns a single host timer (injectable
// for tests) that ticks on a fixed interval; only it touches the real clock.
/**
 * The host-timer sweeper for the thread silence watchdog (GHE #63).
 *
 * Unlike the child-wait scheduler (which arms one timer for a fixed
 * deadline), a silence deadline MOVES with activity - every runtime event on
 * the target resets it. So instead of arming per-deadline, the sweeper ticks
 * on a fixed interval (default 5s) and evaluates every open watch against the
 * target's current last-activity stamp: a watch is due when the target has
 * been silent for at least its PER-SUBSCRIPTION timeout AND the re-emit
 * policy allows it (first fire always; afterwards at each multiple of the
 * timeout). A breach is therefore detected within one tick of the timeout
 * elapsing.
 *
 * The clock is injectable so tests drive it deterministically.
 *
 * @module t3team-threadSilenceWatchSweeper
 */
import * as DateTime from "effect/DateTime";

import {
  isReNotifyDue,
  isSilentBreach,
  THREAD_SILENCE_SWEEP_INTERVAL_MS,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import { type ThreadSilenceWatchIndex } from "./t3team-threadSilenceWatchIndex.ts";
import { type ThreadSilenceActivityState } from "./orchestration/ThreadSilenceWatchdog.ts";

export interface ThreadSilenceWatchClock {
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

const defaultClock: ThreadSilenceWatchClock = {
  now: () => DateTime.nowUnsafe().epochMilliseconds,
  setTimer: (callback, delayMs) => setInterval(callback, delayMs),
  clearTimer: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface ThreadSilenceWatchSweeperDeps {
  readonly index: ThreadSilenceWatchIndex;
  /** The target thread's live activity state (last-activity stamp + pending tools). */
  readonly getActivityState: (threadId: string) => ThreadSilenceActivityState | undefined;
  /** Emit the `thread.silent` notification for every due watch. */
  readonly notifyDue: (
    watches: readonly ThreadSilenceWatchRecord[],
    nowMs: number,
  ) => Promise<void>;
  readonly clock?: ThreadSilenceWatchClock;
  readonly tickMs?: number;
  readonly onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface ThreadSilenceWatchSweeper {
  readonly start: () => void;
  readonly stop: () => void;
}

export function makeThreadSilenceWatchSweeper(
  deps: ThreadSilenceWatchSweeperDeps,
): ThreadSilenceWatchSweeper {
  const clock = deps.clock ?? defaultClock;
  const tickMs = deps.tickMs ?? THREAD_SILENCE_SWEEP_INTERVAL_MS;
  let timer: unknown;
  let stopped = false;

  const dueWatches = (nowMs: number): ThreadSilenceWatchRecord[] => {
    const due: ThreadSilenceWatchRecord[] = [];
    for (const record of deps.index.all()) {
      const state = deps.getActivityState(record.targetThreadId);
      // No live state (e.g. right after a restart before the reactor seeds
      // the target) is NOT a breach: firing on missing data would spam every
      // rehydrated watch. The reactor seeds from the shell's updatedAt.
      if (state === undefined) continue;
      if (
        !isSilentBreach({
          lastActivityAtMs: state.lastActivityAtMs,
          nowMs,
          timeoutMs: record.timeoutMs,
        })
      ) {
        continue;
      }
      if (
        !isReNotifyDue({
          lastNotifiedAtMs: deps.index.notifiedAt(record.watchId),
          nowMs,
          timeoutMs: record.timeoutMs,
        })
      ) {
        continue;
      }
      due.push(record);
    }
    return due;
  };

  const tick = async (): Promise<void> => {
    try {
      const nowMs = clock.now();
      const due = dueWatches(nowMs);
      if (due.length > 0) {
        await deps.notifyDue(due, nowMs);
        // Anchor the re-emit policy to this emission: the next re-notify is
        // due one full per-subscription timeout later (if still silent).
        for (const record of due) {
          deps.index.markNotified(record.watchId, nowMs);
        }
      }
    } catch (error) {
      deps.onWarn?.("thread-silence watchdog sweep failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return {
    start: () => {
      if (stopped || timer !== undefined) return;
      timer = clock.setTimer(() => {
        void tick();
      }, tickMs);
    },
    stop: () => {
      stopped = true;
      if (timer !== undefined) {
        clock.clearTimer(timer);
        timer = undefined;
      }
    },
  };
}
