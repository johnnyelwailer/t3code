/**
 * In-memory index of open thread-silence watches (GHE #63). Pure and
 * engine-free: it tracks which watches are open, which target each belongs
 * to, and when each was last notified (the re-emit policy). Rebuilt on boot
 * by replaying persisted events (see t3team-threadSilenceWatch.ts) - the same
 * rehydrate pattern as the child wait.
 *
 * @module t3team-threadSilenceWatchIndex
 */
import { type ThreadSilenceWatchRecord } from "./t3team-threadSilenceWatch.ts";

export interface ThreadSilenceWatchIndex {
  readonly add: (record: ThreadSilenceWatchRecord) => void;
  readonly remove: (watchId: string) => void;
  readonly forTarget: (targetThreadId: string) => readonly ThreadSilenceWatchRecord[];
  readonly all: () => readonly ThreadSilenceWatchRecord[];
  /** Epoch ms of the last emission for this watch, or undefined when never notified. */
  readonly notifiedAt: (watchId: string) => number | undefined;
  readonly markNotified: (watchId: string, atMs: number) => void;
}

export function makeThreadSilenceWatchIndex(): ThreadSilenceWatchIndex {
  const byWatchId = new Map<string, ThreadSilenceWatchRecord>();
  const byTarget = new Map<string, Set<string>>();
  const notifiedAtByWatchId = new Map<string, number>();

  const add = (record: ThreadSilenceWatchRecord): void => {
    if (byWatchId.has(record.watchId)) return;
    byWatchId.set(record.watchId, record);
    let set = byTarget.get(record.targetThreadId);
    if (!set) {
      set = new Set();
      byTarget.set(record.targetThreadId, set);
    }
    set.add(record.watchId);
  };

  const remove = (watchId: string): void => {
    const record = byWatchId.get(watchId);
    if (!record) return;
    byWatchId.delete(watchId);
    notifiedAtByWatchId.delete(watchId);
    const set = byTarget.get(record.targetThreadId);
    if (set) {
      set.delete(watchId);
      if (set.size === 0) byTarget.delete(record.targetThreadId);
    }
  };

  const forTarget = (targetThreadId: string): readonly ThreadSilenceWatchRecord[] => {
    const set = byTarget.get(targetThreadId);
    if (!set) return [];
    return Array.from(set)
      .map((id) => byWatchId.get(id))
      .filter((record): record is ThreadSilenceWatchRecord => record !== undefined);
  };

  const all = (): readonly ThreadSilenceWatchRecord[] => Array.from(byWatchId.values());

  const notifiedAt = (watchId: string): number | undefined => notifiedAtByWatchId.get(watchId);

  const markNotified = (watchId: string, atMs: number): void => {
    if (!byWatchId.has(watchId)) return;
    notifiedAtByWatchId.set(watchId, atMs);
  };

  return { add, remove, forTarget, all, notifiedAt, markNotified };
}
