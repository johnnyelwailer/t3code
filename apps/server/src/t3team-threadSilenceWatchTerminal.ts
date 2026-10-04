/**
 * Terminal-thread close for the thread silence watchdog: when a thread becomes
 * terminal FOR WATCH PURPOSES - `thread.deleted` (the shell is gone) or
 * `thread.settled` (a decider-level bookkeeping fact that emits no terminal
 * `thread.session-set`, so an armed watch would otherwise keep re-notifying
 * forever) - close every armed watch that touches it: the target's watches
 * resolve with one deduped terminal notice, and the dead thread's own watches
 * are dropped without noise.
 *
 * @module t3team-threadSilenceWatchTerminal
 */
import * as Effect from "effect/Effect";

import { type ThreadSilenceWatchIndex } from "./t3team-threadSilenceWatchIndex.ts";

export interface ThreadSilenceWatchTerminalCloseDeps {
  readonly index: ThreadSilenceWatchIndex;
  readonly stopRecheck: { readonly forgetIfUnwatched: (threadId: string) => void };
  readonly resolveStopped: (
    threadId: string,
    status: string,
    sequence: number,
  ) => Effect.Effect<void>;
}

export type ThreadSilenceWatchTerminalClose = (
  threadId: string,
  stoppedStatus: string,
  sequence: number,
) => Effect.Effect<void>;

export const makeThreadSilenceWatchTerminalClose =
  (deps: ThreadSilenceWatchTerminalCloseDeps): ThreadSilenceWatchTerminalClose =>
  (threadId, stoppedStatus, sequence) => {
    // The dead thread as watcher: its watches are dead with it - drop them
    // without noise.
    for (const record of deps.index.all()) {
      if (record.watcherThreadId === threadId) {
        deps.index.remove(record.watchId);
        deps.stopRecheck.forgetIfUnwatched(record.targetThreadId);
      }
    }
    // The dead thread as target: one deduped terminal notice, then closed.
    return deps
      .resolveStopped(threadId, stoppedStatus, sequence)
      .pipe(Effect.tap(() => Effect.sync(() => deps.stopRecheck.forgetIfUnwatched(threadId))));
  };
