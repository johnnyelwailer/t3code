import type { ModelSelection } from "@t3tools/contracts";

import {
  ACTIVITY_LABEL_WINDOW_SIZE,
  buildActivityLabelContext,
  hashString,
  normalizeSummary,
  type ActivityLabelGeneration,
} from "./t3team-activityLabelContext.ts";
import {
  type ActivityLabelSummarizerRuntime,
  type PendingLabel,
  runActivityLabelGeneration,
  scheduleLabelTtl,
} from "./t3team-activityLabelSummarizerCore.ts";
import { createBoundedThreadMap } from "./t3team-boundedThreadMap.ts";
import { createActivityLabelPersistTracker } from "./t3team-activityLabelPersistTracker.ts";

/**
 * Out-of-band live-activity-label coordinator for active threads (GHE #40, extended
 * by GHE #208). Design notes + the generation/timer mechanics live in
 * `t3team-activityLabelSummarizerCore.ts`; the event-to-generation bridge in
 * `t3team-activityLabelSummarizerReactor.ts`.
 */

export { ACTIVITY_LABEL_TTL_MS } from "./t3team-activityLabelSummarizerCore.ts";
export { createActivityLabelEventReactor } from "./t3team-activityLabelSummarizerReactor.ts";

/**
 * Bounded-size guard for the per-thread maps below (GHE #203): threads that
 * never idle (killed process, crashed provider, a client that never sends a
 * turn-end) would otherwise never be pruned. See `createBoundedThreadMap`
 * for the insert-time eviction mechanism; the thread.deleted prune (reactor
 * side) is still the normal, immediate path.
 */
export const ACTIVITY_LABEL_MAX_TRACKED_THREADS = 500;

export function createActivityLabelSummarizer(input: {
  readonly debounceMs?: number;
  /**
   * Minimum cadence between generated labels (GHE #208 throttle): no new
   * generation starts until this many ms have passed since the last one
   * persisted. Immediate (state-change) flushes defer into the remaining
   * window instead of bursting. Default 60s.
   */
  readonly minRegenerateMs?: number;
  /** Settings gate: when false, note() and clear() are no-ops that just drop pending work. */
  readonly isActive: () => boolean;
  readonly generate: ActivityLabelGeneration;
  readonly persist: (input: {
    readonly threadId: string;
    readonly label: string | null;
    readonly generation: number;
  }) => Promise<void>;
  readonly onError: (cause: unknown) => void;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  /**
   * Minimum life of a persisted label before it may be overridden by the
   * deterministic state word (GHE #208 follow-up). Defaults to
   * `ACTIVITY_LABEL_TTL_MS` (5s); 0 disables the timer (label lives until
   * the next generation or the turn-end clear).
   */
  readonly activityLabelTtlMs?: number;
}) {
  const pending = new Map<string, PendingLabel>();
  const minRegenerateMs = input.minRegenerateMs ?? 60_000;
  const now = input.now ?? Date.now;
  const setTimer = input.setTimer ?? setTimeout;
  const clearTimer = input.clearTimer ?? clearTimeout;
  // GHE #341 race tracking lives in a sibling module (this file is already
  // over the LOC cap): see `t3team-activityLabelPersistTracker.ts`.
  const persistTracker = createActivityLabelPersistTracker();
  /** Cancel `threadId`'s timers and drop it from `pending`; returns the state it had, if any. */
  const clearPendingState = (threadId: string) => {
    const state = pending.get(threadId);
    if (state?.timer) clearTimer(state.timer);
    if (state?.ttlTimer) clearTimer(state.ttlTimer);
    pending.delete(threadId);
    return state;
  };
  // GHE #203: windowByThread is the FIFO source of truth for eviction; its
  // onEvict keeps `pending` (keyed the same way) from drifting out of sync
  // when a never-idling thread gets evicted to make room for a new one.
  // GHE #341: an evicted thread with a REAL persisted label needs that
  // label cleared too, or it is stranded forever once `pending` is gone.
  const windowByThread = createBoundedThreadMap<Array<{ kind: string; summary: string }>>(
    ACTIVITY_LABEL_MAX_TRACKED_THREADS,
    (evictedThreadId) => {
      const state = clearPendingState(evictedThreadId);
      if (persistTracker.clear(evictedThreadId)) {
        void input
          .persist({
            threadId: evictedThreadId,
            label: null,
            generation: (state?.generation ?? 0) + 1,
          })
          .catch(input.onError);
      }
    },
  );
  const runtime: ActivityLabelSummarizerRuntime = {
    pending,
    input,
    now,
    setTimer,
    clearTimer,
    persistTracker,
  };

  return {
    /** Debounced note of new activity; skips generation when the window is unchanged. */
    note: (input_: {
      readonly threadId: string;
      readonly modelSelection: ModelSelection;
      readonly kind: string;
      readonly summary: string;
      readonly userGist?: string | null;
      /** The deterministic 4-state word (GHE #208); a coarse change is the
       *  only immediate-regeneration trigger. */
      readonly activityState?: string | null;
    }) => {
      const summary = normalizeSummary(input_.summary);
      const window = windowByThread.get(input_.threadId) ?? [];
      window.push({ kind: input_.kind, summary });
      const trimmedWindow = window.slice(-ACTIVITY_LABEL_WINDOW_SIZE);
      windowByThread.set(input_.threadId, trimmedWindow);
      // Skip-when-unchanged is keyed on the exact generation payload: repeated
      // identical activity events must not re-trigger inference.
      const context = buildActivityLabelContext(trimmedWindow, input_.userGist);
      const hash = hashString(context);

      const prior = pending.get(input_.threadId);
      if (prior?.timer) clearTimer(prior.timer);
      const generation = (prior?.generation ?? 0) + 1;
      // GHE #208: the only immediate-regeneration trigger is a COARSE state
      // change (one of the four base words) — not every activity kind change.
      // Even that honors the minimum cadence by deferring into the remaining
      // window, so the LLM detail refreshes on a slow cadence and never per
      // event while the deterministic word updates instantly.
      const stateChanged =
        prior !== undefined &&
        prior.lastState !== undefined &&
        input_.activityState !== undefined &&
        prior.lastState !== input_.activityState;
      const next: PendingLabel = {
        generation,
        hash,
        context,
        model: input_.modelSelection,
        userGist: input_.userGist ?? null,
        lastGeneratedHash: prior?.lastGeneratedHash ?? null,
        lastState: input_.activityState ?? prior?.lastState ?? null,
        ...(prior?.lastGeneratedAt !== undefined ? { lastGeneratedAt: prior.lastGeneratedAt } : {}),
        // The pending TTL for the currently persisted label survives a note()
        // (a note only defers the NEXT generation — it does not extend the
        // current label's minimum life).
        ...(prior?.ttlTimer !== undefined ? { ttlTimer: prior.ttlTimer } : {}),
      };
      pending.set(input_.threadId, next);
      // Regenerate only when the recent activity actually changed since the last
      // generation — identical window = same label = skip the inference entirely.
      if (next.lastGeneratedHash === hash) {
        return;
      }
      const baseDelay = stateChanged ? 0 : (input.debounceMs ?? 20_000);
      const remainingUntilNext =
        next.lastGeneratedAt !== undefined ? next.lastGeneratedAt + minRegenerateMs - now() : 0;
      next.timer = setTimer(
        () => {
          void runActivityLabelGeneration(runtime, input_.threadId, generation, hash).catch(
            input.onError,
          );
        },
        Math.max(baseDelay, remainingUntilNext),
      );
    },
    /** Idle/terminal: drop pending work and clear the stored label. */
    clear: async (threadId: string) => {
      windowByThread.delete(threadId);
      const state = clearPendingState(threadId);
      const hadPersistedLabel = persistTracker.clear(threadId);
      // GHE #202: never noted, nothing to clear. GHE #341: a persisted label
      // can outlive `pending` (FIFO-evicted) — check both before skipping.
      if (!state && !hadPersistedLabel) return;
      // Bump the generation so any in-flight generation never persists after us.
      await input.persist({
        threadId,
        label: null,
        generation: (state?.generation ?? 0) + 1,
      });
    },
    /**
     * GHE #203: the thread was deleted — drop its tracked state without
     * persisting anything (there is nothing left to write a label onto).
     * Unlike clear(), this never calls input.persist().
     */
    forget: (threadId: string) => {
      windowByThread.delete(threadId);
      clearPendingState(threadId);
      persistTracker.forget(threadId);
    },
  };
}
