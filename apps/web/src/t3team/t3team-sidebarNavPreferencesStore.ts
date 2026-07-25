import { create } from "zustand";

import { persistStoredSidebarNavPreferences } from "~/t3team/hooks/t3team-sidebarNavPreferencesPersistence";
import {
  getSidebarNavProjectState,
  normalizeSidebarNavPreferences,
  normalizeSidebarNavProjectState,
  prioritizeSidebarItemIds,
  prioritizeSidebarItemId,
  removeSidebarItemIdsFromOrder,
  type T3TeamSidebarNavPreferences,
} from "~/t3team/t3team-sidebarNavPreferences";

type T3TeamSidebarNavPreferencesState = {
  hydrated: boolean;
  preferencesByProjectId: T3TeamSidebarNavPreferences;
  hydrate: (preferencesByProjectId: T3TeamSidebarNavPreferences) => void;
  hideItem: (projectId: string, itemId: string) => void;
  showItem: (projectId: string, itemId: string) => void;
  showItemAtTop: (projectId: string, itemId: string) => void;
  showItemsAtTop: (projectId: string, itemIds: ReadonlyArray<string>) => void;
  removeItemsFromOrder: (projectId: string, itemIds: ReadonlyArray<string>) => void;
  setOrderedItemIds: (projectId: string, itemIds: ReadonlyArray<string>) => void;
};

function updateProjectState(
  preferencesByProjectId: T3TeamSidebarNavPreferences,
  projectId: string,
  update: (
    projectState: ReturnType<typeof normalizeSidebarNavProjectState>,
  ) => ReturnType<typeof normalizeSidebarNavProjectState>,
): T3TeamSidebarNavPreferences {
  const currentProjectState = getSidebarNavProjectState(preferencesByProjectId, projectId);
  return {
    ...preferencesByProjectId,
    [projectId]: update(currentProjectState),
  };
}

export const useT3TeamSidebarNavPreferencesStore = create<T3TeamSidebarNavPreferencesState>(
  (set, get) => ({
    hydrated: false,
    preferencesByProjectId: {},
    hydrate: (preferencesByProjectId) => {
      set({
        hydrated: true,
        preferencesByProjectId: normalizeSidebarNavPreferences(preferencesByProjectId),
      });
    },
    hideItem: (projectId, itemId) => {
      const current = get().preferencesByProjectId;
      const projectState = getSidebarNavProjectState(current, projectId);
      if (projectState.hiddenItemIds.includes(itemId)) {
        return;
      }

      const next = updateProjectState(current, projectId, (state) =>
        normalizeSidebarNavProjectState({
          ...state,
          hiddenItemIds: [...state.hiddenItemIds, itemId],
        }),
      );
      set({ preferencesByProjectId: next });
      persistStoredSidebarNavPreferences(next);
    },
    showItem: (projectId, itemId) => {
      const current = get().preferencesByProjectId;
      const projectState = getSidebarNavProjectState(current, projectId);
      if (!projectState.hiddenItemIds.includes(itemId)) {
        return;
      }

      const next = updateProjectState(current, projectId, (state) =>
        normalizeSidebarNavProjectState({
          ...state,
          hiddenItemIds: state.hiddenItemIds.filter((candidate) => candidate !== itemId),
        }),
      );
      set({ preferencesByProjectId: next });
      persistStoredSidebarNavPreferences(next);
    },
    showItemAtTop: (projectId, itemId) => {
      const current = get().preferencesByProjectId;
      const projectState = getSidebarNavProjectState(current, projectId);
      if (
        !projectState.hiddenItemIds.includes(itemId) &&
        projectState.orderedItemIds[0] === itemId
      ) {
        return;
      }

      const next = updateProjectState(current, projectId, (state) =>
        normalizeSidebarNavProjectState({
          ...state,
          hiddenItemIds: state.hiddenItemIds.filter((candidate) => candidate !== itemId),
          orderedItemIds: prioritizeSidebarItemId(state.orderedItemIds, itemId),
        }),
      );
      set({ preferencesByProjectId: next });
      persistStoredSidebarNavPreferences(next);
    },
    showItemsAtTop: (projectId, itemIds) => {
      const normalizedItemIds = [...new Set(itemIds.filter((itemId) => itemId.length > 0))];
      if (normalizedItemIds.length === 0) {
        return;
      }

      const current = get().preferencesByProjectId;
      const projectState = getSidebarNavProjectState(current, projectId);
      const alreadyVisible = normalizedItemIds.every(
        (itemId) => !projectState.hiddenItemIds.includes(itemId),
      );
      const currentTopIds = projectState.orderedItemIds.slice(0, normalizedItemIds.length);
      const alreadyOrdered = normalizedItemIds.every(
        (itemId, index) => currentTopIds[index] === itemId,
      );
      if (alreadyVisible && alreadyOrdered) {
        return;
      }

      const next = updateProjectState(current, projectId, (state) =>
        normalizeSidebarNavProjectState({
          ...state,
          hiddenItemIds: state.hiddenItemIds.filter(
            (candidate) => !normalizedItemIds.includes(candidate),
          ),
          orderedItemIds: prioritizeSidebarItemIds(state.orderedItemIds, normalizedItemIds),
        }),
      );
      set({ preferencesByProjectId: next });
      persistStoredSidebarNavPreferences(next);
    },
    removeItemsFromOrder: (projectId, itemIds) => {
      const normalizedItemIds = [...new Set(itemIds.filter((itemId) => itemId.length > 0))];
      if (normalizedItemIds.length === 0) {
        return;
      }

      const current = get().preferencesByProjectId;
      const projectState = getSidebarNavProjectState(current, projectId);
      const nextOrderedItemIds = removeSidebarItemIdsFromOrder(
        projectState.orderedItemIds,
        normalizedItemIds,
      );
      if (nextOrderedItemIds.length === projectState.orderedItemIds.length) {
        return;
      }

      const next = updateProjectState(current, projectId, (state) =>
        normalizeSidebarNavProjectState({
          ...state,
          orderedItemIds: nextOrderedItemIds,
        }),
      );
      set({ preferencesByProjectId: next });
      persistStoredSidebarNavPreferences(next);
    },
    setOrderedItemIds: (projectId, itemIds) => {
      const current = get().preferencesByProjectId;
      const next = updateProjectState(current, projectId, (state) =>
        normalizeSidebarNavProjectState({
          ...state,
          orderedItemIds: [...itemIds],
        }),
      );
      set({ preferencesByProjectId: next });
      persistStoredSidebarNavPreferences(next);
    },
  }),
);
