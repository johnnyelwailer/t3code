export type T3TeamSidebarNavProjectState = {
  hiddenItemIds: readonly string[];
  orderedItemIds: readonly string[];
};

export type T3TeamSidebarNavPreferences = Readonly<Record<string, T3TeamSidebarNavProjectState>>;

const EMPTY_SIDEBAR_NAV_PROJECT_STATE: T3TeamSidebarNavProjectState = {
  hiddenItemIds: [],
  orderedItemIds: [],
};

function dedupeIds(ids: ReadonlyArray<string>): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeSidebarNavProjectState(
  value: Partial<T3TeamSidebarNavProjectState> | null | undefined,
): T3TeamSidebarNavProjectState {
  return {
    hiddenItemIds: dedupeIds(value?.hiddenItemIds ?? []),
    orderedItemIds: dedupeIds(value?.orderedItemIds ?? []),
  };
}

export function normalizeSidebarNavPreferences(value: unknown): T3TeamSidebarNavPreferences {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([projectId, projectState]) => [
      projectId,
      normalizeSidebarNavProjectState(
        isRecord(projectState) ? (projectState as Partial<T3TeamSidebarNavProjectState>) : null,
      ),
    ]),
  );
}

export function getSidebarNavProjectState(
  preferencesByProjectId: T3TeamSidebarNavPreferences,
  projectId: string,
): T3TeamSidebarNavProjectState {
  return preferencesByProjectId[projectId] ?? EMPTY_SIDEBAR_NAV_PROJECT_STATE;
}

export function filterHiddenSidebarItems<T extends { id: string }>(
  items: ReadonlyArray<T>,
  hiddenItemIds: ReadonlyArray<string>,
): T[] {
  if (hiddenItemIds.length === 0) {
    return [...items];
  }

  const hiddenIds = new Set(hiddenItemIds);
  return items.filter((item) => !hiddenIds.has(item.id));
}

export function filterHiddenSidebarItemsById<T>(
  items: ReadonlyArray<T>,
  hiddenItemIds: ReadonlyArray<string>,
  getItemId: (item: T) => string,
): T[] {
  if (hiddenItemIds.length === 0) {
    return [...items];
  }

  const hiddenIds = new Set(hiddenItemIds);
  return items.filter((item) => !hiddenIds.has(getItemId(item)));
}

export function sortSidebarItemsByStoredOrder<T extends { id: string }>(
  items: ReadonlyArray<T>,
  orderedItemIds: ReadonlyArray<string>,
): T[] {
  if (orderedItemIds.length === 0) {
    return [...items];
  }

  const orderIndexById = new Map(orderedItemIds.map((itemId, index) => [itemId, index] as const));
  return items.toSorted((left, right) => {
    const leftIndex = orderIndexById.get(left.id);
    const rightIndex = orderIndexById.get(right.id);
    if (leftIndex === undefined && rightIndex === undefined) {
      return 0;
    }
    if (leftIndex === undefined) {
      return 1;
    }
    if (rightIndex === undefined) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

export function sortSidebarItemsByStoredOrderById<T>(
  items: ReadonlyArray<T>,
  orderedItemIds: ReadonlyArray<string>,
  getItemId: (item: T) => string,
): T[] {
  if (orderedItemIds.length === 0) {
    return [...items];
  }

  const orderIndexById = new Map(orderedItemIds.map((itemId, index) => [itemId, index] as const));
  return items.toSorted((left, right) => {
    const leftIndex = orderIndexById.get(getItemId(left));
    const rightIndex = orderIndexById.get(getItemId(right));
    if (leftIndex === undefined && rightIndex === undefined) {
      return 0;
    }
    if (leftIndex === undefined) {
      return 1;
    }
    if (rightIndex === undefined) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

export function prioritizeSidebarItemId(
  orderedItemIds: ReadonlyArray<string>,
  itemId: string,
): string[] {
  if (itemId.length === 0) {
    return dedupeIds(orderedItemIds);
  }

  return dedupeIds([itemId, ...orderedItemIds]);
}

export function prioritizeSidebarItemIds(
  orderedItemIds: ReadonlyArray<string>,
  itemIds: ReadonlyArray<string>,
): string[] {
  return dedupeIds([...itemIds, ...orderedItemIds]);
}

export function removeSidebarItemIdsFromOrder(
  orderedItemIds: ReadonlyArray<string>,
  itemIds: ReadonlyArray<string>,
): string[] {
  const itemIdSet = new Set(itemIds);
  return dedupeIds(orderedItemIds.filter((itemId) => !itemIdSet.has(itemId)));
}

export function reorderSidebarItemsInScope(input: {
  orderedItemIds: ReadonlyArray<string>;
  scopeItemIds: ReadonlyArray<string>;
  sourceItemId: string;
  targetItemId: string;
}): string[] {
  const { orderedItemIds, scopeItemIds, sourceItemId, targetItemId } = input;
  if (sourceItemId === targetItemId) {
    return dedupeIds(orderedItemIds);
  }

  const scopeIds = dedupeIds(scopeItemIds);
  if (!scopeIds.includes(sourceItemId) || !scopeIds.includes(targetItemId)) {
    return dedupeIds(orderedItemIds);
  }

  const orderedScopeIds = sortSidebarItemsByStoredOrder(
    scopeIds.map((id) => ({ id })),
    orderedItemIds,
  ).map((item) => item.id);
  const nextScopeIds = orderedScopeIds.filter((itemId) => itemId !== sourceItemId);
  const targetIndex = nextScopeIds.indexOf(targetItemId);
  nextScopeIds.splice(targetIndex, 0, sourceItemId);

  return dedupeIds([
    ...nextScopeIds,
    ...orderedItemIds.filter((itemId) => !scopeIds.includes(itemId)),
  ]);
}
