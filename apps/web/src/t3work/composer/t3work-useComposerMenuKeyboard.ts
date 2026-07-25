import { useCallback, useEffect, useRef } from "react";

import type { ComposerTrigger } from "~/composer-logic";
import {
  resolveT3workComposerMenuKey,
  type T3workComposerMenuKey,
} from "~/t3work/composer/t3work-composerMenuKeyboard";
import type { T3workComposerMenuItem } from "~/t3work/composer/t3work-composerRecipeSlashItems";

type KeyboardState = {
  readonly trigger: ComposerTrigger | null;
  readonly items: ReadonlyArray<T3workComposerMenuItem>;
  readonly activeItemId: string | null;
  readonly onHighlightItem: (itemId: string | null) => void;
  readonly onAcceptItem: (item: T3workComposerMenuItem) => void;
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
 * t3work surfaces read render-scope values instead, which is why their
 * keyboard path could act on an empty menu while the mouse path worked.
 */
export function useT3workComposerMenuKeyboard(state: KeyboardState) {
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  return useCallback((key: T3workComposerMenuKey): boolean => {
    const current = stateRef.current;
    if (!current.trigger) {
      return false;
    }
    const action = resolveT3workComposerMenuKey({
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
