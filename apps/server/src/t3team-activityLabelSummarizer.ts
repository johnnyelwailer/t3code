import type { ModelSelection } from "@t3tools/contracts";

/**
 * Minimum lifetime of a persisted LLM activity label (GHE #208 follow-up,
 * PJ's design decision): an LLM-generated status text is given a minimum
 * time to live (~5s) so it does not flicker in and out on every state
 * transition — but once it expires, EITHER a new LLM label OR the live
 * deterministic state word may take over. The label is cleared and the
 * display falls back to the `activityState` word via the existing
 * precedence. Each new label generation reschedules this timer (every label
 * gets its own minimum life); the turn-end clear() cancels it. The GHE #40
 * generation throttle (debounce + 60s cadence) is untouched — only the
 * label's DISPLAY LIFE changes.
 */
export const ACTIVITY_LABEL_TTL_MS = 5_000;

/**
 * Bounded-size guard for the per-thread maps below (GHE #203): threads that
 * never idle (killed process, crashed provider, a client that never sends a
 * turn-end) would otherwise never be pruned. See `createBoundedThreadMap`
 * for the insert-time eviction mechanism; the thread.deleted prune (reactor
 * side) is still the normal, immediate path.
 */
export const ACTIVITY_LABEL_MAX_TRACKED_THREADS = 500;

import {
  ACTIVITY_LABEL_WINDOW_SIZE,
  buildActivityLabelContext,
  hashString,
  normalizeSummary,
  parseActivityLabel,
  type ActivityLabelGeneration,
} from "./t3team-activityLabelContext.ts";
import { createBoundedThreadMap } from "./t3team-boundedThreadMap.ts";

/**
 * Out-of-band live-activity-label coordinator for active threads (GHE #40, extended
 * by GHE #208).
 *
 * The deterministic 4-state word (thinking/writing/working/waiting) is the base
 * label and updates instantly with zero inference (see `t3team-activityState.ts`).
 * This module produces only the OPTIONAL free-text enrichment rendered after it
 * (`{state} · {detail}`), with throttled light-inference guarantees:
 *
 * - TINY payload: a hard-capped tiny window (the last few meaningful
 *   activities + a one-line user-intent gist — never the thread or tool
 *   results).
 * - DEBOUNCED (~20s) after the last activity, plus a MINIMUM REGENERATE
 *   cadence (`minRegenerateMs`, ~60s between generated labels): the detail is
 *   a lazy catch-up layer, so it refreshes on a slow cadence rather than per
 *   event. A coarse state change (one of the four base words) is the only
 *   immediate-regeneration trigger, and even it honors the minimum cadence
 *   by deferring into the remaining window instead of bursting.
 * - SKIPPED when the recent-activity window is unchanged since the last
 *   generation; CLEARED on idle/terminal.
 * - TIME-BOXED: a persisted label lives for `ACTIVITY_LABEL_TTL_MS` (5s,
 *   GHE #208 follow-up) before it is cleared so the live deterministic state
 *   word takes over; a newer label reschedules the timer, and the turn-end
 *   clear() cancels it. Only the display life is bounded — the generation
 *   throttle above is unchanged.
 *
 * The settings flag now governs the enrichment only: off = no LLM calls, and
 * the UI shows just the state word. Fail-open: on any error, nothing is
 * persisted and the UI shows just the state word — never a static "Working",
 * never an error state. Callers provide a model invocation and a dedicated
 * projection writer; this module never dispatches a chat message, activity,
 * or provider turn. The pure payload helpers live in `t3team-activityLabelContext.ts`.
 */

interface PendingLabel {
  generation: number;
  /** Hash of the exact generation context — the skip-when-unchanged key. */
  hash: string;
  /** The exact context that `hash` was computed from (the generation payload). */
  context: string;
  model: ModelSelection;
  userGist: string | null;
  lastGeneratedHash: string | null;
  /** Instant (ms) the last generation successfully persisted — the minimum-cadence anchor. */
  lastGeneratedAt?: number;
  /** The deterministic 4-state word last observed — a coarse change is the
   *  only immediate-regeneration trigger (GHE #208). */
  lastState?: string | null;
  timer?: ReturnType<typeof setTimeout>;
  /** The handle of the pending TTL clear for the currently persisted label.
   *  Carried across state replacements in note() so the clear still fires for
   *  the label it was scheduled for; a new persist replaces the handle, and
   *  the handle identity is the race guard (never clear a label that
   *  rescheduled its own timer). */
  ttlTimer?: ReturnType<typeof setTimeout>;
}

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
  const windowByThread = createBoundedThreadMap<Array<{ kind: string; summary: string }>>(
    ACTIVITY_LABEL_MAX_TRACKED_THREADS,
    (evictedThreadId) => clearPendingState(evictedThreadId),
  );

  /**
   * Schedule the TTL clear for a label that was just persisted.
   * Replaces any pending TTL timer: each label owns exactly one timer for
   * its own minimum life. The callback is guarded on the timer handle —
   * if this exact handle is no longer the one on the thread's state, either
   * a newer label rescheduled (cancel replaced it) or a turn-end clear() ran
   * (the entry was deleted), and this late fire must not clear anything.
   */
  const scheduleLabelTtl = (threadId: string) => {
    const state = pending.get(threadId);
    if (!state) return;
    if (state.ttlTimer) clearTimer(state.ttlTimer);
    const ttlMs = input.activityLabelTtlMs ?? ACTIVITY_LABEL_TTL_MS;
    if (ttlMs <= 0) return;
    state.ttlTimer = setTimer(() => {
      const latest = pending.get(threadId);
      if (!latest || latest.ttlTimer !== state.ttlTimer) return;
      void input
        .persist({ threadId, label: null, generation: latest.generation })
        .catch(input.onError);
    }, ttlMs);
  };

  const run = async (threadId: string, generation: number, hash: string) => {
    const state = pending.get(threadId);
    if (!state || state.generation !== generation || state.hash !== hash) return;
    if (!input.isActive()) return;
    const rawLabel = await input.generate({
      modelSelection: state.model,
      context: state.context,
    });
    const label = parseActivityLabel(rawLabel);
    // A newer note() or clear() superseded this generation: never write stale labels.
    const current = pending.get(threadId);
    if (!label || !current || current.generation !== generation || current.hash !== hash) {
      return;
    }
    await input.persist({ threadId, label, generation });
    current.lastGeneratedHash = hash;
    current.lastGeneratedAt = now();
    // GHE #208 follow-up: give this label its minimum life, then let the
    // live state word (or the next LLM label) take over.
    scheduleLabelTtl(threadId);
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
          void run(input_.threadId, generation, hash).catch(input.onError);
        },
        Math.max(baseDelay, remainingUntilNext),
      );
    },
    /** Idle/terminal: drop pending work and clear the stored label. */
    clear: async (threadId: string) => {
      windowByThread.delete(threadId);
      const state = clearPendingState(threadId);
      // GHE #202: nothing was ever noted for this thread (the flag was off, or
      // no activity landed) — there is no label to clear, so skip the
      // meta.update entirely instead of dispatching a no-op clear every idle.
      if (!state) return;
      // Bump the generation so any in-flight generation never persists after us.
      await input.persist({
        threadId,
        label: null,
        generation: state.generation + 1,
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
    },
  };
}

/** Event-to-generation bridge kept provider-agnostic for integration testing. */
export function createActivityLabelEventReactor(input: {
  /** Load the thread's aux model selection + one-line user-intent gist; null when unavailable. */
  readonly loadThread: (threadId: string) => Promise<{
    readonly modelSelection: ModelSelection;
    readonly userGist: string | null;
  } | null>;
  readonly generate: ActivityLabelGeneration;
  readonly persist: Parameters<typeof createActivityLabelSummarizer>[0]["persist"];
  readonly isActive: () => boolean;
  readonly onError: (cause: unknown) => void;
  readonly debounceMs?: number;
  readonly minRegenerateMs?: number;
  readonly setTimer?: Parameters<typeof createActivityLabelSummarizer>[0]["setTimer"];
  readonly clearTimer?: Parameters<typeof createActivityLabelSummarizer>[0]["clearTimer"];
  readonly activityLabelTtlMs?: number;
}) {
  const summarizer = createActivityLabelSummarizer({
    generate: input.generate,
    persist: input.persist,
    isActive: input.isActive,
    onError: input.onError,
    ...(input.debounceMs === undefined ? {} : { debounceMs: input.debounceMs }),
    ...(input.minRegenerateMs === undefined ? {} : { minRegenerateMs: input.minRegenerateMs }),
    ...(input.setTimer === undefined ? {} : { setTimer: input.setTimer }),
    ...(input.clearTimer === undefined ? {} : { clearTimer: input.clearTimer }),
    ...(input.activityLabelTtlMs === undefined
      ? {}
      : { activityLabelTtlMs: input.activityLabelTtlMs }),
  });

  return {
    /** One meaningful activity was appended to the thread. */
    handle: async (event: {
      readonly threadId: string;
      readonly kind: string;
      readonly summary: string;
      /** The deterministic 4-state word at note time (GHE #208). */
      readonly activityState?: string | null;
    }) => {
      if (!input.isActive()) return;
      const thread = await input.loadThread(event.threadId);
      if (!thread) return;
      summarizer.note({
        threadId: event.threadId,
        modelSelection: thread.modelSelection,
        kind: event.kind,
        summary: event.summary,
        userGist: thread.userGist,
        ...(event.activityState !== undefined ? { activityState: event.activityState } : {}),
      });
    },
    /** The thread went idle or terminal: clear the label. */
    clear: (threadId: string) => summarizer.clear(threadId),
    /** GHE #203: the thread was deleted — drop tracked state, no persist. */
    forget: (threadId: string) => summarizer.forget(threadId),
  };
}
