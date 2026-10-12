import type { ReferenceThreadSource } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isThreadWorking,
  sortWorkingThreadsBySend,
} from "@t3tools/client-runtime/state/thread-inbox";
import {
  sortActiveThreadsByOrderKey,
  sortPinnedThreadsByOrderKey,
  sortSettledThreads,
} from "@t3tools/client-runtime/state/thread-sort";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";

import { resolveSidebarThreadSection } from "~/components/Sidebar.logic";

/** A roster row: the live shell (minus its own `source` OrchestrationV2ThreadShell) plus how the
 * thread relates to the reference. */
export type ReferenceThreadRow = Omit<EnvironmentThreadShell, "source"> & {
  readonly source: ReferenceThreadSource;
};

export type ReferenceSectionKey = "pinned" | "active" | "working" | "snoozed" | "settled";

export interface ReferenceThreadSection {
  readonly key: ReferenceSectionKey;
  readonly label: string;
  readonly threads: readonly ReferenceThreadRow[];
}

const SECTION_LABELS: Readonly<Record<ReferenceSectionKey, string>> = {
  pinned: "Pinned",
  active: "Active",
  working: "Working",
  snoozed: "Snoozed",
  settled: "Settled",
};

const SECTION_ORDER: readonly ReferenceSectionKey[] = [
  "pinned",
  "active",
  "working",
  "snoozed",
  "settled",
];

/**
 * Group a roster into the main sidebar's shelves. Snooze and settlement are recomputed live
 * against `now`; a stale pin loses to a lifecycle shelf; working threads fold out of the active
 * shelf the way the Working beta does. Subagent threads are kept deliberately — the roster is the
 * related set, not the sidebar's visible set.
 */
export function groupReferenceThreads(
  threads: readonly ReferenceThreadRow[],
  now: string,
): readonly ReferenceThreadSection[] {
  const buckets: Record<ReferenceSectionKey, ReferenceThreadRow[]> = {
    pinned: [],
    active: [],
    working: [],
    snoozed: [],
    settled: [],
  };
  for (const thread of threads) {
    const section = resolveSidebarThreadSection({
      snoozed: effectiveSnoozed(thread, { now }),
      settled: thread.settledOverride === "settled",
      pinned: thread.pinnedAt != null,
    });
    if (section === "active" && isThreadWorking(thread)) {
      buckets.working.push(thread);
    } else {
      buckets[section].push(thread);
    }
  }
  buckets.pinned = sortPinnedThreadsByOrderKey(buckets.pinned);
  buckets.active = sortActiveThreadsByOrderKey(buckets.active);
  buckets.working = sortWorkingThreadsBySend(buckets.working);
  buckets.snoozed = sortActiveThreadsByOrderKey(buckets.snoozed);
  buckets.settled = sortSettledThreads(buckets.settled);
  return SECTION_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: SECTION_LABELS[key],
    threads: buckets[key],
  }));
}
