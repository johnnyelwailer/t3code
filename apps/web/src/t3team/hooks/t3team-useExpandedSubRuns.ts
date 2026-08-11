import { create } from "zustand";

interface ExpandedSubRunsState {
  /** Parent thread ids whose sub-runs chip is currently expanded. */
  readonly expandedParentIds: ReadonlySet<string>;
  readonly toggle: (parentThreadId: string) => void;
}

/**
 * Session-local expansion state for the "N sub-runs" chip (Epic: first-class
 * sub-runbooks, tree v2). Deliberately NOT persisted and NOT derived from
 * `useProjectStore()` — it is pure UI state, default-collapsed, and resets on
 * reload like every other transient disclosure in the sidebar.
 */
export const useExpandedSubRunsStore = create<ExpandedSubRunsState>((set) => ({
  expandedParentIds: new Set(),
  toggle: (parentThreadId) =>
    set((state) => {
      const next = new Set(state.expandedParentIds);
      if (next.has(parentThreadId)) {
        next.delete(parentThreadId);
      } else {
        next.add(parentThreadId);
      }
      return { expandedParentIds: next };
    }),
}));
