/**
 * In-memory index of pending child-waits for `t3team.thread.children` (GHE
 * #55). Pure and engine-free: it tracks which waits are open, which child each
 * belongs to, and which deadlines are due. Rebuilt on boot by replaying
 * persisted events (see t3team-childWait.ts).
 *
 * @module t3team-childWaitIndex
 */
import { type ChildWaitRecord } from "./t3team-childWait.ts";

export interface ChildWaitIndex {
  readonly add: (record: ChildWaitRecord) => void;
  readonly remove: (waitId: string) => void;
  readonly forChild: (childThreadId: string) => readonly ChildWaitRecord[];
  readonly all: () => readonly ChildWaitRecord[];
  readonly soonestDeadlineMs: (nowMs: number) => number | undefined;
  readonly due: (nowMs: number) => readonly ChildWaitRecord[];
}

export function makeChildWaitIndex(): ChildWaitIndex {
  const byWaitId = new Map<string, ChildWaitRecord>();
  const byChild = new Map<string, Set<string>>();
  const add = (record: ChildWaitRecord): void => {
    if (byWaitId.has(record.waitId)) return;
    byWaitId.set(record.waitId, record);
    let set = byChild.get(record.childThreadId);
    if (!set) {
      set = new Set();
      byChild.set(record.childThreadId, set);
    }
    set.add(record.waitId);
  };
  const remove = (waitId: string): void => {
    const record = byWaitId.get(waitId);
    if (!record) return;
    byWaitId.delete(waitId);
    const set = byChild.get(record.childThreadId);
    if (set) {
      set.delete(waitId);
      if (set.size === 0) byChild.delete(record.childThreadId);
    }
  };
  const forChild = (childThreadId: string): readonly ChildWaitRecord[] => {
    const set = byChild.get(childThreadId);
    if (!set) return [];
    return Array.from(set)
      .map((id) => byWaitId.get(id))
      .filter((record): record is ChildWaitRecord => record !== undefined);
  };
  const all = (): readonly ChildWaitRecord[] => Array.from(byWaitId.values());
  const deadlineMs = (record: ChildWaitRecord): number | undefined => {
    if (!record.deadlineIso) return undefined;
    const ms = Date.parse(record.deadlineIso);
    return Number.isNaN(ms) ? undefined : ms;
  };
  const soonestDeadlineMs = (nowMs: number): number | undefined => {
    let soonest: number | undefined;
    for (const record of byWaitId.values()) {
      const ms = deadlineMs(record);
      if (ms === undefined) continue;
      if (ms < nowMs) return 0; // already due
      if (soonest === undefined || ms < soonest) soonest = ms;
    }
    return soonest;
  };
  const due = (nowMs: number): readonly ChildWaitRecord[] =>
    all().filter((record) => {
      const ms = deadlineMs(record);
      return ms !== undefined && ms <= nowMs;
    });
  return { add, remove, forChild, all, soonestDeadlineMs, due };
}
