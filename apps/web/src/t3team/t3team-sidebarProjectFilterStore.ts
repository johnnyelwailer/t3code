import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

/**
 * The project pills' "remove from view": project keys the reader hid stop drawing as discs but
 * stay searchable, so one can bring a project back. Keyed by the sidebar's stable project key.
 */
interface SidebarProjectFilterState {
  readonly hiddenProjectKeys: ReadonlySet<string>;
  readonly hideProject: (projectKey: string) => void;
  readonly showProject: (projectKey: string) => void;
}

export const useT3TeamSidebarProjectFilterStore = create<SidebarProjectFilterState>()(
  persist(
    (set) => ({
      hiddenProjectKeys: new Set<string>(),
      hideProject: (projectKey) =>
        set((state) => {
          if (state.hiddenProjectKeys.has(projectKey)) return state;
          const hiddenProjectKeys = new Set(state.hiddenProjectKeys);
          hiddenProjectKeys.add(projectKey);
          return { hiddenProjectKeys };
        }),
      showProject: (projectKey) =>
        set((state) => {
          if (!state.hiddenProjectKeys.has(projectKey)) return state;
          const hiddenProjectKeys = new Set(state.hiddenProjectKeys);
          hiddenProjectKeys.delete(projectKey);
          return { hiddenProjectKeys };
        }),
    }),
    {
      name: "t3code:sidebar-project-filter:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ hiddenProjectKeys }) => ({ hiddenProjectKeys: [...hiddenProjectKeys] }),
      merge: (persisted, current) => ({
        ...current,
        hiddenProjectKeys: new Set(
          (persisted as { hiddenProjectKeys?: readonly string[] } | undefined)?.hiddenProjectKeys ??
            [],
        ),
      }),
    },
  ),
);
