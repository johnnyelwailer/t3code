/**
 * Event-to-generation bridge for the live-activity-label coordinator (split
 * out of `t3team-activityLabelSummarizer.ts`), kept provider-agnostic for
 * integration testing.
 */

import type { ModelSelection } from "@t3tools/contracts";

import type { ActivityLabelGeneration } from "./t3team-activityLabelContext.ts";
import { createActivityLabelSummarizer } from "./t3team-activityLabelSummarizer.ts";

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
