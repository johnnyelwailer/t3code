import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

/**
 * The sidebar's environment filter, kept in localStorage like the other sidebar scope. The stored
 * id is never rewritten when its environment is missing, so a filter returns with its environment;
 * `resolveEnvironmentFilter` decides what holds. The hidden set keeps environments out of the
 * pills until one is brought back; the primary ("This computer") never joins it.
 */
interface SidebarEnvironmentFilterState {
  readonly selectedEnvironmentId: string | null;
  readonly select: (environmentId: string | null) => void;
  readonly hiddenEnvironmentIds: ReadonlySet<string>;
  readonly hideEnvironment: (environmentId: string) => void;
  readonly showEnvironment: (environmentId: string) => void;
}

export const useT3TeamSidebarEnvironmentFilterStore = create<SidebarEnvironmentFilterState>()(
  persist(
    (set) => ({
      selectedEnvironmentId: null,
      select: (selectedEnvironmentId) =>
        set((state) =>
          state.selectedEnvironmentId === selectedEnvironmentId ? state : { selectedEnvironmentId },
        ),
      hiddenEnvironmentIds: new Set<string>(),
      hideEnvironment: (environmentId) =>
        set((state) => {
          if (state.hiddenEnvironmentIds.has(environmentId)) return state;
          const hiddenEnvironmentIds = new Set(state.hiddenEnvironmentIds);
          hiddenEnvironmentIds.add(environmentId);
          return { hiddenEnvironmentIds };
        }),
      showEnvironment: (environmentId) =>
        set((state) => {
          if (!state.hiddenEnvironmentIds.has(environmentId)) return state;
          const hiddenEnvironmentIds = new Set(state.hiddenEnvironmentIds);
          hiddenEnvironmentIds.delete(environmentId);
          return { hiddenEnvironmentIds };
        }),
    }),
    {
      name: "t3code:sidebar-environment-filter:v2",
      version: 2,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ selectedEnvironmentId, hiddenEnvironmentIds }) => ({
        selectedEnvironmentId,
        hiddenEnvironmentIds: [...hiddenEnvironmentIds],
      }),
      merge: (persisted, current) => {
        const stored = persisted as
          | { selectedEnvironmentId?: string | null; hiddenEnvironmentIds?: readonly string[] }
          | undefined;
        return {
          ...current,
          selectedEnvironmentId: stored?.selectedEnvironmentId ?? current.selectedEnvironmentId,
          hiddenEnvironmentIds: new Set(stored?.hiddenEnvironmentIds ?? []),
        };
      },
    },
  ),
);
