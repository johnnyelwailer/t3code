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
}

/**
 * Expansion state for the "N sub-runs" chip (Epic: first-class sub-runbooks,
 * tree v2). Persisted to localStorage (survives reload). Expansion is
 * user-driven only — a parent is never auto-expanded when one of its
 * children starts running, so freshly started child threads keep the row
 * collapsed; `toggle` is the sole mutator.
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
}));
