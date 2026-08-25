/**
 * Rehydration replay for the thread silence watchdog (GHE #63): rebuild the
 * pending watch set from persisted events (registered activities minus
 * cancelled ones - the same replay idiom as the child wait, GHE #55).
 *
 * @module t3team-threadSilenceWatchRehydrate
 */
import type { OrchestrationEvent } from "@t3tools/contracts";

import {
  parseThreadSilenceWatchEvent,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";

/**
 * Rebuild the pending watch set from persisted events: registered activities
 * minus cancelled ones (a cancel drops every open watch of that watcher on
 * that target).
 */
export function collectPendingThreadSilenceWatches(
  events: readonly OrchestrationEvent[],
): ThreadSilenceWatchRecord[] {
  const pending = new Map<string, ThreadSilenceWatchRecord>();
  for (const event of events) {
    const action = parseThreadSilenceWatchEvent(event);
    if (action === null) continue;
    if (action.type === "registered") {
      // A duplicate watchId in the persisted log is a no-op (first wins),
      // consistent with the live index's add.
      if (pending.has(action.record.watchId)) continue;
      pending.set(action.record.watchId, action.record);
    } else {
      for (const [watchId, record] of pending) {
        if (
          record.watcherThreadId === action.watcherThreadId &&
          record.targetThreadId === action.targetThreadId
        ) {
          pending.delete(watchId);
        }
      }
    }
  }
  return Array.from(pending.values());
}
