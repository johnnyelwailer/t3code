/**
 * GHE #341 follow-up: side state for `t3team-activityLabelSummarizer.ts`'s
 * label persistence races. Kept in its own module because the summarizer
 * file is already over the additive-guard's 200-LOC cap.
 *
 * Two independent problems, one small piece of state each:
 *
 * 1. STRANDED LABEL AFTER FIFO EVICTION — a persisted label is kept (for its
 *    TTL) after its `pending` bookkeeping is gone, so "a label is currently
 *    persisted for this thread" cannot be read off `pending`. Eviction (and
 *    clear()'s GHE #202 early-return) must consult this set, not `pending`.
 * 2. STALE POST-PERSIST WRITE — an in-flight generation's `await
 *    input.persist(...)` can resolve after forget() already dropped the
 *    thread. The epoch, bumped only by forget(), lets the generation notice
 *    on return and discard its result instead of resurrecting the thread.
 */
export function createActivityLabelPersistTracker() {
  const persistedThreads = new Set<string>();
  const epochByThread = new Map<string, number>();
  return {
    /** Mark that a real label is now persisted for this thread. */
    markPersisted: (threadId: string) => {
      persistedThreads.add(threadId);
    },
    /** Drop the thread; returns whether it had a persisted label. */
    clear: (threadId: string) => persistedThreads.delete(threadId),
    epochOf: (threadId: string) => epochByThread.get(threadId) ?? 0,
    /** The thread is gone: drop it and bump its epoch so any in-flight
     *  generation's post-await checks discard their result. */
    forget: (threadId: string) => {
      persistedThreads.delete(threadId);
      epochByThread.set(threadId, (epochByThread.get(threadId) ?? 0) + 1);
    },
  };
}
