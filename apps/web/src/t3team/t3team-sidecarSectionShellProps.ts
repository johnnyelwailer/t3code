import type { ReactNode } from "react";

export type T3TeamSidecarSectionShellProps<TItem = unknown> = {
  readonly orderItemIds?: ((itemIds: ReadonlyArray<string>) => ReadonlyArray<string>) | undefined;
  readonly wrapItem?: ((item: TItem, content: ReactNode) => ReactNode) | undefined;
};

export function orderT3TeamSidecarSectionItems<TItem>(input: {
  readonly items: ReadonlyArray<TItem>;
  readonly getItemId: (item: TItem) => string;
  readonly shell?: T3TeamSidecarSectionShellProps<TItem> | undefined;
}): ReadonlyArray<TItem> {
  if (!input.shell?.orderItemIds) {
    return input.items;
  }

  const itemsById = new Map(input.items.map((item) => [input.getItemId(item), item]));
  const seenIds = new Set<string>();
  const orderedItems: TItem[] = [];

  for (const itemId of input.shell.orderItemIds(input.items.map(input.getItemId))) {
    if (seenIds.has(itemId)) {
      continue;
    }

    const item = itemsById.get(itemId);
    if (!item) {
      continue;
    }

    orderedItems.push(item);
    seenIds.add(itemId);
  }

  return orderedItems;
}
