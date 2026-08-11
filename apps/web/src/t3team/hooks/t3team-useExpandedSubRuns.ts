import * as Schema from "effect/Schema";
import { create } from "zustand";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

/** Follows the SETTLED/SNOOZED_SHELF_EXPANDED_KEY naming in Sidebar.tsx. */
const EXPANDED_SUB_RUN_PARENTS_KEY = "t3code:sidebar-v2:expanded-subrun-parents";

function readPersistedExpandedParentIds(): ReadonlySet<string> {
  try {
    const stored = getLocalStorageItem(EXPANDED_SUB_RUN_PARENTS_KEY, Schema.Array(Schema.String));
    return stored ? new Set(stored) : new Set();
  } catch (error) {
    console.error("[t3team] Could not read persisted sub-run expansion.", error);
    return new Set();
  }
}

function writePersistedExpandedParentIds(ids: ReadonlySet<string>): void {
  try {
    setLocalStorageItem(EXPANDED_SUB_RUN_PARENTS_KEY, [...ids], Schema.Array(Schema.String));
  } catch (error) {
    console.error("[t3team] Could not persist sub-run expansion.", error);
  }
}

interface ExpandedSubRunsState {
  /** Parent thread ids whose sub-runs chip is currently expanded. */
  readonly expandedParentIds: ReadonlySet<string>;
  readonly toggle: (parentThreadId: string) => void;
  /**
   * Adds parent ids to the expanded set without touching ones already
   * present. Used by Sidebar.tsx to auto-expand a parent the moment one of
   * its children starts running — additive only, so it can never collapse
   * anything the user (or a previous auto-expand) already opened.
   */
  readonly ensureExpanded: (parentThreadIds: ReadonlyArray<string>) => void;
}

/**
 * Expansion state for the "N sub-runs" chip (Epic: first-class sub-runbooks,
 * tree v2). Persisted to localStorage (survives reload) and additionally
 * auto-expanded by Sidebar.tsx whenever a parent's children include a
 * RUNNING thread, so active sub-run work is never hidden behind a collapsed
 * chip after a reload — see `ensureExpanded`.
 */
export const useExpandedSubRunsStore = create<ExpandedSubRunsState>((set) => ({
  expandedParentIds: readPersistedExpandedParentIds(),
  toggle: (parentThreadId) =>
    set((state) => {
      const next = new Set(state.expandedParentIds);
      if (next.has(parentThreadId)) {
        next.delete(parentThreadId);
      } else {
        next.add(parentThreadId);
      }
      writePersistedExpandedParentIds(next);
      return { expandedParentIds: next };
    }),
  ensureExpanded: (parentThreadIds) =>
    set((state) => {
      const missing = parentThreadIds.filter((id) => !state.expandedParentIds.has(id));
      if (missing.length === 0) return state;
      const next = new Set(state.expandedParentIds);
      for (const id of missing) next.add(id);
      writePersistedExpandedParentIds(next);
      return { expandedParentIds: next };
    }),
}));
