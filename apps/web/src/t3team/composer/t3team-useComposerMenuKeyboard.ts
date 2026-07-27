import { useCallback, useEffect, useRef } from "react";

import type { ComposerTrigger } from "~/composer-logic";
import {
  resolveT3TeamComposerMenuKey,
  type T3TeamComposerMenuKey,
} from "~/t3team/composer/t3team-composerMenuKeyboard";
import type { T3TeamComposerMenuItem } from "~/t3team/composer/t3team-composerRecipeSlashItems";

type KeyboardState = {
  readonly trigger: ComposerTrigger | null;
  readonly items: ReadonlyArray<T3TeamComposerMenuItem>;
  readonly activeItemId: string | null;
  readonly onHighlightItem: (itemId: string | null) => void;
  readonly onAcceptItem: (item: T3TeamComposerMenuItem) => void;
  readonly onClose: () => void;
};

/**
 * Keyboard driver for a composer command menu.
 *
 * The returned handler is registered with the prompt editor through a Lexical
 * command effect, so it can outlive the render that produced it. It therefore
 * reads the menu state through a ref that is re-synced after every commit —
 * never through the closure it was created in. `ChatComposer` relies on the
 * same discipline (`composerMenuItemsRef`, `activeComposerMenuItemRef`); the
 * t3team surfaces read render-scope values instead, which is why their
 * keyboard path could act on an empty menu while the mouse path worked.
 */
export function useT3TeamComposerMenuKeyboard(state: KeyboardState) {
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  return useCallback((key: T3TeamComposerMenuKey): boolean => {
    const current = stateRef.current;
    if (!current.trigger) {
      return false;
    }
    const action = resolveT3TeamComposerMenuKey({
      key,
      items: current.items,
      activeItemId: current.activeItemId,
    });
    if (action.type === "ignore") {
      return false;
    }
    if (action.type === "close") {
      current.onClose();
      return true;
    }
    if (action.type === "highlight") {
      current.onHighlightItem(action.itemId);
      return true;
    }
    const item = current.items.find((candidate) => candidate.id === action.itemId);
    if (!item) {
      return false;
    }
    current.onAcceptItem(item);
    return true;
  }, []);
}
