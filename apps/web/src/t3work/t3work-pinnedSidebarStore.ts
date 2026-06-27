import { create } from "zustand";
import type { T3WorkSidebarPinnedItem } from "~/t3work/t3work-sidebarPinningTypes";

type T3WorkPinnedSidebarState = {
  hydrated: boolean;
  items: readonly T3WorkSidebarPinnedItem[];
  hydrate: (items: ReadonlyArray<T3WorkSidebarPinnedItem>) => void;
  pinItem: (item: T3WorkSidebarPinnedItem) => void;
  unpinItem: (itemId: string) => void;
  unpinItems: (itemIds: ReadonlyArray<string>) => void;
};

function sortPinnedItems(items: ReadonlyArray<T3WorkSidebarPinnedItem>) {
  return [...items].sort((left, right) => right.pinnedAt.localeCompare(left.pinnedAt));
}

let persistPinnedItems: (items: ReadonlyArray<T3WorkSidebarPinnedItem>) => void = () => {};

export function configurePinnedSidebarPersister(
  persister: (items: ReadonlyArray<T3WorkSidebarPinnedItem>) => void,
): () => void {
  persistPinnedItems = persister;
  return () => {
    if (persistPinnedItems === persister) {
      persistPinnedItems = () => {};
    }
  };
}

export const useT3WorkPinnedSidebarStore = create<T3WorkPinnedSidebarState>((set, get) => ({
  hydrated: false,
  items: [],
  hydrate: (items) => {
    set({ hydrated: true, items: sortPinnedItems(items) });
  },
  pinItem: (item) => {
    const current = get().items;
    if (current.some((candidate) => candidate.id === item.id)) {
      return;
    }

    const next = sortPinnedItems([item, ...current]);
    set({ items: next });
    persistPinnedItems(next);
  },
  unpinItem: (itemId) => {
    const current = get().items;
    const next = current.filter((candidate) => candidate.id !== itemId);
    if (next.length === current.length) {
      return;
    }

    set({ items: next });
    persistPinnedItems(next);
  },
  unpinItems: (itemIds) => {
    const itemIdSet = new Set(itemIds);
    if (itemIdSet.size === 0) {
      return;
    }

    const current = get().items;
    const next = current.filter((candidate) => !itemIdSet.has(candidate.id));
    if (next.length === current.length) {
      return;
    }

    set({ items: next });
    persistPinnedItems(next);
  },
}));
