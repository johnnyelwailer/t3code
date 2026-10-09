import { useState } from "react";

// Per collapse scope, the thread the user last collapsed the aside over: a remount showing that
// same thread respects the collapse, while a different thread opening reveals the aside again.
const collapsedOverThread = new Map<string, string>();

/**
 * Whether a collapsed aside is shown anyway because something was opened beside the main pane,
 * without overwriting the stored choice to keep it collapsed.
 *
 * Two reasons, tracked apart so closing one never undoes the other:
 * - an item (a PR, a ticket, a staged recipe): reveals when a new one opens, folds away when it
 *   closes;
 * - the embedded thread: reveals when it changes, but a thread the user already collapsed the
 *   aside over stays collapsed when the view remounts.
 * Both are derived during render, so the first paint is already right (no collapsed→open flash).
 */
export function useAsideReveal(input: {
  scopeKey: string;
  itemRequest: object | null | undefined;
  threadKey: string | null | undefined;
  isCollapsed: boolean;
  setCollapsedState: (collapsed: boolean) => void;
}) {
  const { scopeKey, isCollapsed, setCollapsedState } = input;
  const itemRequest = input.itemRequest ?? null;
  const threadKey = input.threadKey ?? null;
  const [previousItem, setPreviousItem] = useState(itemRequest);
  const [previousThread, setPreviousThread] = useState(threadKey);
  // An item already open when this aside mounts was opened on another screen (the store is
  // global, and that screen closes it on its way out): only items opened here reveal.
  const [itemRevealed, setItemRevealed] = useState(false);
  const [threadRevealed, setThreadRevealed] = useState(
    () => threadKey !== null && collapsedOverThread.get(scopeKey) !== threadKey,
  );
  if (itemRequest !== previousItem) {
    setPreviousItem(itemRequest);
    setItemRevealed(itemRequest !== null);
  }
  if (threadKey !== previousThread) {
    setPreviousThread(threadKey);
    setThreadRevealed(threadKey !== null);
  }
  const asideCollapsed = isCollapsed && !itemRevealed && !threadRevealed;
  const toggleCollapsed = () => {
    if (asideCollapsed) {
      setCollapsedState(false);
      return;
    }
    // Collapsing always wins over a reveal, whether the aside was open by choice or for something.
    setItemRevealed(false);
    setThreadRevealed(false);
    if (threadKey !== null) collapsedOverThread.set(scopeKey, threadKey);
    if (!isCollapsed) setCollapsedState(true);
  };
  return { asideCollapsed, toggleCollapsed };
}
