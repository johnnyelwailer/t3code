/**
 * Turns a bootstrap that never finishes into one the user can see and act on.
 *
 * A launch has exactly three honest outcomes: it works, it fails loudly, or it is still going. What
 * this path actually did was a fourth — it sat on "Creating thread…" forever with a disabled retry
 * button, no console error and no server log. A silent hang is indistinguishable from slow, so the
 * user waits on something that is never going to happen.
 *
 * Creating a thread is a single dispatch against a connected socket. If it has not produced a live
 * conversation within this window, something is wrong rather than slow — say so, and re-enable the
 * retry.
 */

import { useEffect, useState } from "react";

import { recordT3TeamThreadDebug } from "~/t3team/chat/t3team-threadDebug";

/** Generous next to a sub-second dispatch, short enough that nobody sits staring at a spinner. */
export const THREAD_BOOTSTRAP_STALL_MS = 12_000;

export function useThreadBootstrapStall(input: {
  /** Whether the bootstrap is still supposed to be working. */
  readonly pending: boolean;
  readonly threadId: string;
  readonly stallAfterMs?: number;
}): boolean {
  const { pending, threadId } = input;
  const stallAfterMs = input.stallAfterMs ?? THREAD_BOOTSTRAP_STALL_MS;
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!pending) {
      setStalled(false);
      return;
    }

    const timer = setTimeout(() => {
      setStalled(true);
      // The user-visible message says what to do; this says what happened, in the same ring buffer
      // the rest of the bootstrap reports to, so the stall is diagnosable after the fact.
      recordT3TeamThreadDebug("thread-bootstrap.stalled", { threadId, stallAfterMs });
    }, stallAfterMs);

    return () => clearTimeout(timer);
  }, [pending, stallAfterMs, threadId]);

  return stalled;
}
