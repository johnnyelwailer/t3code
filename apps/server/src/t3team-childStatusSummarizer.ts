import type { ModelSelection } from "@t3tools/contracts";

/**
 * Out-of-band child status coordinator. Callers provide a model invocation and a dedicated
 * projection writer; it never dispatches a chat message, activity, or provider turn.
 */
export type ChildStatusGeneration = (input: {
  readonly modelSelection: ModelSelection;
  readonly activity: ReadonlyArray<{ readonly kind: string; readonly summary: string }>;
}) => Promise<unknown>;

export const parseChildStatus = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as { status?: unknown }).status;
  if (typeof status !== "string") return null;
  const normalized = status.replaceAll(/\s+/g, " ").trim();
  return normalized.length >= 3 &&
    normalized.length <= 96 &&
    !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
};

export function createChildStatusSummarizer(input: {
  readonly debounceMs?: number;
  readonly generate: ChildStatusGeneration;
  readonly persist: (input: {
    readonly threadId: string;
    readonly status: string;
    readonly updatedAt: string;
    readonly generation: number;
  }) => Promise<void>;
  readonly nowIso: () => string;
  readonly onError: (cause: unknown) => void;
  readonly setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const latest = new Map<
    string,
    {
      generation: number;
      model: ModelSelection;
      activity: ReadonlyArray<{ kind: string; summary: string }>;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  const setTimer = input.setTimer ?? setTimeout;
  const clearTimer = input.clearTimer ?? clearTimeout;
  const run = async (threadId: string, generation: number) => {
    const pending = latest.get(threadId);
    if (!pending || pending.generation !== generation) return;
    const status = parseChildStatus(
      await input.generate({ modelSelection: pending.model, activity: pending.activity }),
    );
    if (!status || latest.get(threadId)?.generation !== generation) return;
    await input.persist({ threadId, status, updatedAt: input.nowIso(), generation });
  };
  return {
    note: (input_: {
      readonly threadId: string;
      readonly modelSelection: ModelSelection;
      readonly activity: ReadonlyArray<{ readonly kind: string; readonly summary: string }>;
    }) => {
      const prior = latest.get(input_.threadId);
      if (prior?.timer) clearTimer(prior.timer);
      const generation = (prior?.generation ?? 0) + 1;
      const next = {
        generation,
        model: input_.modelSelection,
        activity: input_.activity.slice(-8),
      };
      const timer = setTimer(() => {
        void run(input_.threadId, generation).catch(input.onError);
      }, input.debounceMs ?? 1_500);
      latest.set(input_.threadId, { ...next, timer });
      return generation;
    },
    flush: async (threadId: string) => {
      const pending = latest.get(threadId);
      if (pending) await run(threadId, pending.generation);
    },
  };
}

/** Event-to-generation bridge kept provider-agnostic for integration testing. */
export function createChildStatusEventReactor(input: {
  readonly loadChild: (
    threadId: string,
  ) => Promise<{ readonly id: string; readonly modelSelection: ModelSelection } | null>;
  readonly generate: ChildStatusGeneration;
  readonly persist: Parameters<typeof createChildStatusSummarizer>[0]["persist"];
  readonly nowIso: () => string;
  readonly onError: (cause: unknown) => void;
  readonly debounceMs?: number;
  readonly setTimer?: Parameters<typeof createChildStatusSummarizer>[0]["setTimer"];
  readonly clearTimer?: Parameters<typeof createChildStatusSummarizer>[0]["clearTimer"];
}) {
  const recent = new Map<string, Array<{ kind: string; summary: string }>>();
  const summarizer = createChildStatusSummarizer({
    generate: input.generate,
    persist: input.persist,
    nowIso: input.nowIso,
    onError: input.onError,
    ...(input.debounceMs === undefined ? {} : { debounceMs: input.debounceMs }),
    ...(input.setTimer === undefined ? {} : { setTimer: input.setTimer }),
    ...(input.clearTimer === undefined ? {} : { clearTimer: input.clearTimer }),
  });
  return {
    handle: async (event: {
      readonly threadId: string;
      readonly kind: string;
      readonly summary: string;
    }) => {
      const child = await input.loadChild(event.threadId);
      if (!child) return;
      const activity = [
        ...(recent.get(child.id) ?? []),
        {
          kind: event.kind,
          summary: event.summary.replaceAll(/\s+/g, " ").trim().slice(0, 160),
        },
      ].slice(-8);
      recent.set(child.id, activity);
      summarizer.note({ threadId: child.id, modelSelection: child.modelSelection, activity });
    },
    flush: (threadId: string) => summarizer.flush(threadId),
  };
}
