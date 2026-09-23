/**
 * Shared state + generation/timer mechanics for the out-of-band
 * live-activity-label coordinator (`t3team-activityLabelSummarizer.ts`),
 * split out of that module.
 *
 * Out-of-band live-activity-label coordinator for active threads (GHE #40, extended
 * by GHE #208).
 *
 * The deterministic 4-state word (thinking/writing/working/waiting) is the base
 * label and updates instantly with zero inference (see `t3team-activityState.ts`).
 * The summarizer produces only the OPTIONAL free-text enrichment rendered after it
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

import type { ModelSelection } from "@t3tools/contracts";

import { parseActivityLabel, type ActivityLabelGeneration } from "./t3team-activityLabelContext.ts";

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

export interface PendingLabel {
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

/** Resolved per-thread state + callbacks + clocks for the label generation/timer mechanics. */
export interface ActivityLabelSummarizerRuntime {
  readonly pending: Map<string, PendingLabel>;
  readonly input: {
    readonly isActive: () => boolean;
    readonly generate: ActivityLabelGeneration;
    readonly persist: (input: {
      readonly threadId: string;
      readonly label: string | null;
      readonly generation: number;
    }) => Promise<void>;
    readonly onError: (cause: unknown) => void;
    readonly activityLabelTtlMs?: number;
  };
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * Schedule the TTL clear for a label that was just persisted.
 * Replaces any pending TTL timer: each label owns exactly one timer for
 * its own minimum life. The callback is guarded on the timer handle —
 * if this exact handle is no longer the one on the thread's state, either
 * a newer label rescheduled (cancel replaced it) or a turn-end clear() ran
 * (the entry was deleted), and this late fire must not clear anything.
 */
export function scheduleLabelTtl(runtime: ActivityLabelSummarizerRuntime, threadId: string) {
  const state = runtime.pending.get(threadId);
  if (!state) return;
  if (state.ttlTimer) runtime.clearTimer(state.ttlTimer);
  const ttlMs = runtime.input.activityLabelTtlMs ?? ACTIVITY_LABEL_TTL_MS;
  if (ttlMs <= 0) return;
  state.ttlTimer = runtime.setTimer(() => {
    const latest = runtime.pending.get(threadId);
    if (!latest || latest.ttlTimer !== state.ttlTimer) return;
    void runtime.input
      .persist({ threadId, label: null, generation: latest.generation })
      .catch(runtime.input.onError);
  }, ttlMs);
}

/** Run one scheduled generation; persists only when it is still the current one. */
export async function runActivityLabelGeneration(
  runtime: ActivityLabelSummarizerRuntime,
  threadId: string,
  generation: number,
  hash: string,
) {
  const state = runtime.pending.get(threadId);
  if (!state || state.generation !== generation || state.hash !== hash) return;
  if (!runtime.input.isActive()) return;
  const rawLabel = await runtime.input.generate({
    modelSelection: state.model,
    context: state.context,
  });
  const label = parseActivityLabel(rawLabel);
  // A newer note() or clear() superseded this generation: never write stale labels.
  const current = runtime.pending.get(threadId);
  if (!label || !current || current.generation !== generation || current.hash !== hash) {
    return;
  }
  await runtime.input.persist({ threadId, label, generation });
  current.lastGeneratedHash = hash;
  current.lastGeneratedAt = runtime.now();
  // GHE #208 follow-up: give this label its minimum life, then let the
  // live state word (or the next LLM label) take over.
  scheduleLabelTtl(runtime, threadId);
}
