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
 * Out-of-band live-activity-label coordinator for active threads (GHE #40).
 *
 * Sibling of `t3team-childStatusSummarizer.ts`, with two added light-inference
 * guarantees: the payload is a hard-capped tiny window (the last few
 * meaningful activities + a one-line user-intent gist — never the thread or
 * tool results), and generation is SKIPPED when that window is byte-identical
 * to the one already labelled. Fail-open: on any error, or when the settings
 * flag is off, nothing is persisted and the UI keeps the static "Working" pill.
 * Callers provide a model invocation and a dedicated projection writer; this
 * module never dispatches a chat message, activity, or provider turn. The
 * pure payload helpers live in `t3team-activityLabelContext.ts`.
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
  /** Activity-kind class (the first dot-segment, e.g. "tool" / "read" / "turn")
   *  of the last noted activity — a class change is a "significant state
   *  change" and regenerates immediately instead of waiting out the debounce. */
  lastKindClass?: string;
  timer?: ReturnType<typeof setTimeout>;
}

export function createActivityLabelSummarizer(input: {
  readonly debounceMs?: number;
  /** Settings gate: when false, note() and clear() are no-ops that just drop pending work. */
  readonly isActive: () => boolean;
  readonly generate: ActivityLabelGeneration;
  readonly persist: (input: {
    readonly threadId: string;
    readonly label: string | null;
    readonly generation: number;
  }) => Promise<void>;
  readonly onError: (cause: unknown) => void;
  readonly setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const pending = new Map<string, PendingLabel>();
  const windowByThread = new Map<string, Array<{ kind: string; summary: string }>>();
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
  };

  return {
    /** Debounced note of new activity; skips generation when the window is unchanged. */
    note: (input_: {
      readonly threadId: string;
      readonly modelSelection: ModelSelection;
      readonly kind: string;
      readonly summary: string;
      readonly userGist?: string | null;
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
      // A NEW kind of activity (new tool started, plan updated, …) is a
      // significant state change: regenerate now instead of after the debounce.
      const kindClass = input_.kind.split(".")[0] ?? input_.kind;
      const next: PendingLabel = {
        generation,
        hash,
        context,
        model: input_.modelSelection,
        userGist: input_.userGist ?? null,
        lastGeneratedHash: prior?.lastGeneratedHash ?? null,
        lastKindClass: kindClass,
      };
      pending.set(input_.threadId, next);
      // Regenerate only when the recent activity actually changed since the last
      // generation — identical window = same label = skip the inference entirely.
      if (next.lastGeneratedHash === hash) {
        return;
      }
      const immediate =
        prior !== undefined &&
        prior.lastKindClass !== undefined &&
        prior.lastKindClass !== kindClass;
      next.timer = setTimer(
        () => {
          void run(input_.threadId, generation, hash).catch(input.onError);
        },
        immediate ? 0 : (input.debounceMs ?? 20_000),
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
  readonly setTimer?: Parameters<typeof createActivityLabelSummarizer>[0]["setTimer"];
  readonly clearTimer?: Parameters<typeof createActivityLabelSummarizer>[0]["clearTimer"];
}) {
  const summarizer = createActivityLabelSummarizer({
    generate: input.generate,
    persist: input.persist,
    isActive: input.isActive,
    onError: input.onError,
    ...(input.debounceMs === undefined ? {} : { debounceMs: input.debounceMs }),
    ...(input.setTimer === undefined ? {} : { setTimer: input.setTimer }),
    ...(input.clearTimer === undefined ? {} : { clearTimer: input.clearTimer }),
  });

  return {
    /** One meaningful activity was appended to the thread. */
    handle: async (event: {
      readonly threadId: string;
      readonly kind: string;
      readonly summary: string;
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
      });
    },
    /** The thread went idle or terminal: clear the label. */
    clear: (threadId: string) => summarizer.clear(threadId),
  };
}
