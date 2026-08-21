import { create } from "zustand";

import type { InboxWorkItemAttribution } from "~/t3team/t3team-inboxWorkItems";
import type { SubRunCounts } from "~/t3team/hooks/t3team-useChildThreadRelations";

/**
 * Per-row data for every thread in the Work-lens sidebar, mirrored out of
 * `Sidebar.tsx`'s single `useT3TeamSidebarThreadMeta()` call.
 *
 * ## Why this exists
 *
 * Two per-row slots — `InboxSubRunsChip` and `InboxThreadAttribution` — used to
 * call `useT3TeamChildThreadRelations()` and `useT3TeamInboxAttribution()` inside
 * EVERY `SidebarThreadRow`, each of which called `useProjectStore()` internally.
 * `useProjectStore()` is NOT a shared singleton: it is a heavy stateful hook
 * that creates its own `useState` instances and runs hydration effects. With ~60
 * visible thread rows, a single thread click triggered ~120 independent
 * `useProjectStore` subscriptions to fire, React to re-render all 120 components,
 * run all their layout/passive effects, and then repeat as those effects churned
 * `threads`. Measured cost: ~2.4 s per click.
 *
 * ## The fix
 *
 * `Sidebar.tsx` already holds one `useT3TeamSidebarThreadMeta()` call (its
 * replacement for the old `useT3TeamChildThreadRelations()`). That call computes
 * attribution and sub-run counts for every thread in one pass and writes the two
 * maps here. Per-row slots read their own entry with a narrow Zustand selector —
 * O(1) per render, no `useProjectStore` involved, memo barriers intact.
 *
 * Setters skip `setState` when the incoming value is reference-equal to the
 * current one, so a `useProjectStore` update that doesn't actually change any
 * attribution or count never propagates a re-render to the row slots at all.
 */
type T3TeamSidebarThreadDataState = {
  /**
   * Work-item attribution for each thread, keyed by thread id.
   * `null` value means the thread has no attribution (chip hidden).
   * Absent key means the store hasn't been populated yet (same effect).
   */
  readonly attributionByThreadId: ReadonlyMap<string, InboxWorkItemAttribution | null>;
  /**
   * Sub-run counts for parent threads, keyed by parent thread id.
   * Absent key means the thread has no children (chip hidden).
   */
  readonly subRunCountsByParentId: ReadonlyMap<string, SubRunCounts>;
  setAttributionByThreadId: (map: ReadonlyMap<string, InboxWorkItemAttribution | null>) => void;
  setSubRunCountsByParentId: (map: ReadonlyMap<string, SubRunCounts>) => void;
};

export const useT3TeamSidebarThreadDataStore = create<T3TeamSidebarThreadDataState>((set) => ({
  attributionByThreadId: new Map(),
  subRunCountsByParentId: new Map(),
  setAttributionByThreadId: (map) =>
    set((state) => (state.attributionByThreadId === map ? state : { attributionByThreadId: map })),
  setSubRunCountsByParentId: (map) =>
    set((state) =>
      state.subRunCountsByParentId === map ? state : { subRunCountsByParentId: map },
    ),
}));
