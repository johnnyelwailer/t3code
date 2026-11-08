import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

/**
 * The sidebar's environment filter, kept in localStorage like the other sidebar scope. The stored
 * id is never rewritten when its environment is missing, so a filter returns with its environment;
 * `resolveEnvironmentFilter` decides what holds.
 */
interface SidebarEnvironmentFilterState {
  readonly selectedEnvironmentId: string | null;
  readonly select: (environmentId: string | null) => void;
}

export const useT3TeamSidebarEnvironmentFilterStore = create<SidebarEnvironmentFilterState>()(
  persist(
    (set) => ({
      selectedEnvironmentId: null,
      select: (selectedEnvironmentId) =>
        set((state) =>
          state.selectedEnvironmentId === selectedEnvironmentId ? state : { selectedEnvironmentId },
        ),
    }),
    {
      name: "t3code:sidebar-environment-filter:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ selectedEnvironmentId }) => ({ selectedEnvironmentId }),
    },
  ),
);
