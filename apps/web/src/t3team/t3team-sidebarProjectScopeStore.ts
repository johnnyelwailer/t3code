import { create } from "zustand";

/**
 * The sidebar's current project scope, mirrored out of upstream `Sidebar.tsx` so chrome that
 * renders OUTSIDE the scrolling nav (the footer's "My work" / "Backlog" rows) can follow it.
 * Upstream keeps `scopedProjectGroup` as local component state; the footer is a sibling with no
 * prop path to it, and threading a prop through upstream's `Sidebar` → `SidebarChrome` chain
 * would touch far more upstream surface than this one-field mirror.
 */
type T3TeamSidebarProjectScopeState = {
  /** Representative project id of the scoped group, or `null` for "All projects". */
  scopedProjectId: string | null;
  setScopedProjectId: (projectId: string | null) => void;
};

export const useT3TeamSidebarProjectScope = create<T3TeamSidebarProjectScopeState>((set) => ({
  scopedProjectId: null,
  setScopedProjectId: (projectId) =>
    set((state) => (state.scopedProjectId === projectId ? state : { scopedProjectId: projectId })),
}));
