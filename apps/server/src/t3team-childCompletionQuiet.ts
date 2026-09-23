// @effect-diagnostics globalTimers:off -- owns the completion quiet-period host timer.
/**
 * Completion quiet-period gate (GHE #55 follow-up; fix for the misfiring
 * silent-completion notice). A child's session settling to `ready`/`idle` is
 * NOT terminal: a multi-turn agent goes running -> ready -> running between
 * every turn, and `ready` means idle, not done. The silent-completion notice is
 * therefore only eligible once the child has stayed quiet (no new turn) for a
 * configured period. This module owns that timing gate: it records a
 * settlement, cancels it on resume, and fires `onQuiet` after the quiet period
 * elapses without a resume.
 *
 * This is a DELIVERY-TIMING gate, not an agent-decision heuristic: it decides
 * WHEN to prompt the parent that a child may have finished without reporting,
 * never WHAT the child's work state is. Abnormal stops (failed/aborted) do not
 * go through it — they are genuine terminals and notify immediately. The
 * once-per-terminal-epoch dedup is still the shared ledger the caller wraps the
 * notifier in; this gate only makes the completion notice eligible.
 *
 * The clock is injectable so tests drive it deterministically. `onQuiet` is a
 * fire-and-forget callback the reactor wires to the ledger-gated notifier.
 *
 * @module t3team-childCompletionQuiet
 */
import * as DateTime from "effect/DateTime";

/** Default quiet period before a settled child is considered "done" enough to
 *  prompt the parent. Long enough that an autonomous agent resuming the next
 *  turn within a few seconds never triggers a false notice; short enough that
 *  a genuinely finished child is reported promptly. */
export const COMPLETION_QUIET_PERIOD_MS = 60_000;

export interface ChildCompletionQuietClock {
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

const defaultClock: ChildCompletionQuietClock = {
  now: () => DateTime.nowUnsafe().epochMilliseconds,
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ChildCompletionQuiet {
  /**
   * The child just settled (session `ready`/`idle`) at `settleSeq`: record it as
   * a pending completion whose quiet period starts now. A later settlement
   * re-arms (resets) the quiet period.
   */
  readonly noteSettled: (childThreadId: string, settleSeq: number) => void;
  /** The child resumed (session `running`/`starting`): it is not done — cancel. */
  readonly noteResumed: (childThreadId: string) => void;
  /** Clear all pending timers (on layer shutdown). */
  readonly stop: () => void;
}

export function makeChildCompletionQuiet(deps: {
  readonly quietPeriodMs?: number;
  readonly clock?: ChildCompletionQuietClock;
  /** Fires once the quiet period has elapsed without a resume. */
  readonly onQuiet: (childThreadId: string, settleSeq: number) => Promise<void>;
}): ChildCompletionQuiet {
  const clock = deps.clock ?? defaultClock;
  const quietPeriodMs = deps.quietPeriodMs ?? COMPLETION_QUIET_PERIOD_MS;
  const pending = new Map<string, { readonly settleSeq: number; readonly timer: unknown }>();
  let stopped = false;

  const clearChild = (childThreadId: string): void => {
    const entry = pending.get(childThreadId);
    if (entry !== undefined) {
      clock.clearTimer(entry.timer);
      pending.delete(childThreadId);
    }
  };

  return {
    noteSettled: (childThreadId, settleSeq) => {
      if (stopped) return;
      clearChild(childThreadId);
      const timer = clock.setTimer(() => {
        pending.delete(childThreadId);
        void deps.onQuiet(childThreadId, settleSeq);
      }, quietPeriodMs);
      pending.set(childThreadId, { settleSeq, timer });
    },
    noteResumed: (childThreadId) => {
      clearChild(childThreadId);
    },
    stop: () => {
      stopped = true;
      for (const childThreadId of [...pending.keys()]) clearChild(childThreadId);
    },
  };
}
