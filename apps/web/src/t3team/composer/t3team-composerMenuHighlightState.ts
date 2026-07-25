import { useCallback, useEffect, useState } from "react";

import { resolveComposerMenuActiveItemId } from "~/components/chat/composerMenuHighlight";

type HighlightableItem = { readonly id: string };

/**
 * Keyboard/mouse highlight bookkeeping for a composer command menu.
 *
 * Same rules the chat composer applies inline: the highlight is remembered per
 * search key (trigger kind + normalized query) so re-ranking a new query falls
 * back to the first item, and clearing the trigger clears the highlight.
 */
export function useT3TeamComposerMenuHighlight(
  items: ReadonlyArray<HighlightableItem>,
  searchKey: string | null,
) {
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [highlightedSearchKey, setHighlightedSearchKey] = useState<string | null>(null);

  const activeItemId = resolveComposerMenuActiveItemId({
    items,
    highlightedItemId,
    currentSearchKey: searchKey,
    highlightedSearchKey,
  });

  useEffect(() => {
    if (searchKey === null) {
      setHighlightedItemId(null);
      setHighlightedSearchKey(null);
      return;
    }
    setHighlightedItemId((existing) => (existing === activeItemId ? existing : activeItemId));
    setHighlightedSearchKey((existing) => (existing === searchKey ? existing : searchKey));
  }, [activeItemId, searchKey]);

  const onHighlightedItemChange = useCallback(
    (itemId: string | null) => {
      setHighlightedItemId(itemId);
      setHighlightedSearchKey(searchKey);
    },
    [searchKey],
  );

  return { activeItemId, onHighlightedItemChange, setHighlightedItemId };
}
