import { useCallback, useMemo } from "react";

import {
  filterHiddenSidebarItems,
  getSidebarNavProjectState,
  reorderSidebarItemsInScope,
  sortSidebarItemsByStoredOrder,
} from "~/t3team/t3team-sidebarNavPreferences";
import { useT3TeamSidebarNavPreferencesStore } from "~/t3team/t3team-sidebarNavPreferencesStore";

export function useProjectSidebarNavItemPreferences(projectId: string) {
  const projectState = useT3TeamSidebarNavPreferencesStore((state) =>
    getSidebarNavProjectState(state.preferencesByProjectId, projectId),
  );
  const hideItem = useT3TeamSidebarNavPreferencesStore((state) => state.hideItem);
  const showItem = useT3TeamSidebarNavPreferencesStore((state) => state.showItem);
  const setOrderedItemIds = useT3TeamSidebarNavPreferencesStore((state) => state.setOrderedItemIds);

  const hiddenItemIdSet = useMemo(
    () => new Set(projectState.hiddenItemIds),
    [projectState.hiddenItemIds],
  );

  const sortItems = useCallback(
    <T extends { id: string }>(items: ReadonlyArray<T>) =>
      sortSidebarItemsByStoredOrder(items, projectState.orderedItemIds),
    [projectState.orderedItemIds],
  );

  const filterAndSortItems = useCallback(
    <T extends { id: string }>(items: ReadonlyArray<T>) =>
      sortSidebarItemsByStoredOrder(
        filterHiddenSidebarItems(items, projectState.hiddenItemIds),
        projectState.orderedItemIds,
      ),
    [projectState.hiddenItemIds, projectState.orderedItemIds],
  );

  const reorderItemsInScope = useCallback(
    (scopeItemIds: ReadonlyArray<string>, sourceItemId: string, targetItemId: string) => {
      setOrderedItemIds(
        projectId,
        reorderSidebarItemsInScope({
          orderedItemIds: projectState.orderedItemIds,
          scopeItemIds,
          sourceItemId,
          targetItemId,
        }),
      );
    },
    [projectId, projectState.orderedItemIds, setOrderedItemIds],
  );

  const hideSidebarItem = useCallback(
    (itemId: string) => {
      hideItem(projectId, itemId);
    },
    [hideItem, projectId],
  );

  const showSidebarItem = useCallback(
    (itemId: string) => {
      showItem(projectId, itemId);
    },
    [projectId, showItem],
  );

  return {
    hiddenItemIds: projectState.hiddenItemIds,
    hiddenItemIdSet,
    orderedItemIds: projectState.orderedItemIds,
    sortItems,
    filterAndSortItems,
    reorderItemsInScope,
    hideSidebarItem,
    showSidebarItem,
  };
}
