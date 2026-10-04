import type { ScopedProjectRef } from "@t3tools/contracts";
import { create } from "zustand";

/**
 * The sidebar's current project scope, mirrored out of upstream `Sidebar.tsx` so chrome that
 * renders OUTSIDE the scrolling nav (the footer's "My work" / "Backlog" rows, the pull request
 * route) can follow it. Upstream keeps `scopedProjectGroup` as local component state; those
 * consumers are siblings with no prop path to it, and threading a prop through upstream's
 * `Sidebar` → `SidebarChrome` chain would touch far more upstream surface than this mirror.
 */
type T3TeamSidebarProjectScopeState = {
  /** Representative project id of the scoped group, or `null` for "All projects". */
  scopedProjectId: string | null;
  /** Every physical project the scoped group spans, or `null` for "All projects". */
  scopedProjectRefs: ReadonlyArray<ScopedProjectRef> | null;
  /**
   * Normalized remote keys (`normalizeGitRemoteUrl`) of the repositories each work-source project
   * links, by project id. Mirrored from the sidebar's single `useProjectStore()` instance so the
   * pull request route can widen a Jira-project scope to its repositories without a second store.
   */
  linkedRepositoryKeysByProjectId: ReadonlyMap<string, ReadonlyArray<string>>;
  setScopedProject: (
    projectId: string | null,
    projectRefs: ReadonlyArray<ScopedProjectRef> | null,
  ) => void;
  setLinkedRepositoryKeysByProjectId: (
    keysByProjectId: ReadonlyMap<string, ReadonlyArray<string>>,
  ) => void;
};

export const useT3TeamSidebarProjectScope = create<T3TeamSidebarProjectScopeState>((set) => ({
  scopedProjectId: null,
  scopedProjectRefs: null,
  linkedRepositoryKeysByProjectId: new Map(),
  setScopedProject: (projectId, projectRefs) =>
    set((state) =>
      state.scopedProjectId === projectId && state.scopedProjectRefs === projectRefs
        ? state
        : { scopedProjectId: projectId, scopedProjectRefs: projectRefs },
    ),
  setLinkedRepositoryKeysByProjectId: (keysByProjectId) =>
    set((state) =>
      state.linkedRepositoryKeysByProjectId === keysByProjectId
        ? state
        : { linkedRepositoryKeysByProjectId: keysByProjectId },
    ),
}));
