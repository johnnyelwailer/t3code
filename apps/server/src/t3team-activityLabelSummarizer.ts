import type { ModelSelection } from "@t3tools/contracts";
import {
  ACTIVITY_LABEL_WINDOW_SIZE,
  buildActivityLabelContext,
  hashString,
  normalizeSummary,
  parseActivityLabel,
  type ActivityLabelGeneration,
} from "./t3team-activityLabelContext.ts";

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
}) {
  const pending = new Map<string, PendingLabel>();
  const windowByThread = new Map<string, Array<{ kind: string; summary: string }>>();
  const minRegenerateMs = input.minRegenerateMs ?? 60_000;
  const now = input.now ?? Date.now;
  const setTimer = input.setTimer ?? setTimeout;
  const clearTimer = input.clearTimer ?? clearTimeout;

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
      const state = pending.get(threadId);
      if (state?.timer) clearTimer(state.timer);
      pending.delete(threadId);
      // Bump the generation so any in-flight generation never persists after us.
      await input.persist({
        threadId,
        label: null,
        generation: (state?.generation ?? 0) + 1,
      });
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
  };
}
