import { create } from "zustand";

import type { ProjectThread } from "~/t3team/t3team-types";

/**
 * The sidebar's child-thread relations, mirrored out of `Sidebar.tsx`'s existing
 * `useT3TeamChildThreadRelations()` call — same pattern as `t3team-sidebarProjectScopeStore`.
 *
 * `useT3TeamChildThreadRelations` is backed by `useProjectStore()`, which is NOT a shared store:
 * it is a heavy stateful hook (local thread state + hydration effects that fetch thread
 * placements from the backend). Every call site gets its OWN independent instance that has to
 * hydrate on its own. The sidebar's instance hydrates because it mounts early and stays mounted;
 * a second instance created fresh inside `ChatView` (which mounts/remounts per active thread) may
 * never finish hydrating, or hydrates before the backend connection is ready — either way its
 * `childThreadsByParentId` can stay empty even though the sidebar is showing the same threads with
 * their parent/child relation fully resolved. Spinning up a whole duplicate project store per
 * `ChatView` instance is also wasted work even when it does hydrate.
 *
 * So instead of a second `useProjectStore()`/`useT3TeamChildThreadRelations()` call anywhere else,
 * this one-field mirror lets other chrome (the Agents panel fork section) read the SAME relations
 * the sidebar already computed, without a prop path through upstream's component tree.
 */
type T3TeamChildThreadRelationsState = {
  childThreadsByParentId: ReadonlyMap<string, ReadonlyArray<ProjectThread>>;
  setChildThreadsByParentId: (
    childThreadsByParentId: ReadonlyMap<string, ReadonlyArray<ProjectThread>>,
  ) => void;
};

export const useT3TeamChildThreadRelationsStore = create<T3TeamChildThreadRelationsState>(
  (set) => ({
    childThreadsByParentId: new Map(),
    setChildThreadsByParentId: (childThreadsByParentId) =>
      set((state) =>
        state.childThreadsByParentId === childThreadsByParentId
          ? state
          : { childThreadsByParentId },
      ),
  }),
);
