// @effect-diagnostics globalTimers:off -- the scheduler owns a single host timer (injectable
// for tests) armed for the soonest deadline; only it touches the real clock.
/**
 * The host timer for child-wait deadlines (GHE #55) — the orchestration
 * engine's durable-timer idiom (see t3team-workflowSchedulerCore.ts). A single
 * timer is armed for the soonest pending deadline; when it fires, every wait
 * whose deadline has passed is resolved as a timeout and the timer re-arms for
 * the next. The clock is injectable so tests drive it deterministically.
 *
 * @module t3team-childWaitScheduler
 */
import * as DateTime from "effect/DateTime";

import { type ChildWaitIndex } from "./t3team-childWaitIndex.ts";
import { type ChildWaitRecord } from "./t3team-childWait.ts";

const MIN_DUE_DELAY_MS = 1000;

export interface ChildWaitClock {
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

const defaultClock: ChildWaitClock = {
  now: () => DateTime.nowUnsafe().epochMilliseconds,
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ChildWaitSchedulerDeps {
  readonly index: ChildWaitIndex;
  /** Resolve every wait whose deadline has passed (as a timeout). */
  readonly resolveDue: (records: readonly ChildWaitRecord[]) => Promise<void>;
  readonly clock?: ChildWaitClock;
  readonly onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface ChildWaitScheduler {
  readonly rearm: () => Promise<void>;
  readonly stop: () => void;
}

export function makeChildWaitScheduler(deps: ChildWaitSchedulerDeps): ChildWaitScheduler {
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

  const tick = async (): Promise<void> => {
    timer = undefined;
    try {
      const nowMs = clock.now();
      const due = deps.index.due(nowMs);
      if (due.length > 0) {
        await deps.resolveDue(due);
      }
      await rearm();
    } catch (error) {
      deps.onWarn?.("child-wait scheduler tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const performRearm = async (): Promise<void> => {
    if (stopped) return;
    clear();
    const soonest = deps.index.soonestDeadlineMs(clock.now());
    if (soonest === undefined) return;
    const remaining = soonest === 0 ? 0 : soonest - clock.now();
    const delayMs = remaining <= 0 ? MIN_DUE_DELAY_MS : remaining;
    timer = clock.setTimer(tick, delayMs);
  };

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
