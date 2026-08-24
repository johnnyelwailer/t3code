import { useCallback, useMemo, useRef, useState } from "react";

import { type ComposerTrigger, detectComposerTrigger } from "~/composer-logic";
import { useComposerPathSearch } from "~/lib/composerPathSearchState";
import {
  resolveT3TeamComposerPathSearchTarget,
  type T3TeamComposerPathSearchScope,
} from "~/t3team/composer/t3team-composerPathSearchTarget";
import { useT3TeamComposerMenuHighlight } from "~/t3team/composer/t3team-composerMenuHighlightState";
import {
  buildT3TeamComposerMenuItems,
  type T3TeamComposerMenuSources,
} from "~/t3team/composer/t3team-composerMenuItems";
import {
  applyT3TeamComposerMenuReplacement,
  type T3TeamComposerMenuAppliedText,
} from "~/t3team/composer/t3team-composerMenuApply";
import {
  resolveT3TeamComposerMenuSelection,
  type T3TeamComposerMenuSelectionEffect,
} from "~/t3team/composer/t3team-composerMenuSelection";
import type { T3TeamComposerMenuItem } from "~/t3team/composer/t3team-composerRecipeSlashItems";
import { useT3TeamComposerMenuKeyboard } from "~/t3team/composer/t3team-useComposerMenuKeyboard";

export type { T3TeamComposerPathSearchScope };

export type T3TeamComposerCommandMenuInput = {
  readonly sources: Omit<T3TeamComposerMenuSources, "pathEntries">;
  readonly pathSearch: T3TeamComposerPathSearchScope | null;
  /** Reads the live editor text with the expanded (raw-text) cursor position. */
  readonly readSnapshot: () => { readonly value: string; readonly expandedCursor: number };
  /** Writes the post-replacement editor text plus its collapsed cursor. */
  readonly applyText: (next: T3TeamComposerMenuAppliedText) => void;
  readonly onSelectionEffect: (effect: T3TeamComposerMenuSelectionEffect) => void;
  /**
   * Builds t3team-owned items appended after the shared ones (the recipes
   * group). Called with the live trigger so the query can rank them.
   */
  readonly buildExtraItems?: (trigger: ComposerTrigger) => ReadonlyArray<T3TeamComposerMenuItem>;
  /**
   * Trigger to start from, read once on mount. Surfaces that restore a draft
   * (the chat composer) open the menu straight away when the restored text ends
   * in a live `/`, `@` or `$` token.
   */
  readonly readInitialTrigger?: () => ComposerTrigger | null;
};

/**
 * Shared composer command-menu controller for `/`, `@` and `$` triggers.
 *
 * Consumed by t3team composer surfaces (kickoff today) so they get the same
 * trigger detection, item ranking, highlight rules and keyboard navigation the
 * chat composer implements inline.
 */
export function useT3TeamComposerCommandMenu(input: T3TeamComposerCommandMenuInput) {
  const readInitialTrigger = input.readInitialTrigger;
  const [trigger, setTrigger] = useState<ComposerTrigger | null>(
    () => readInitialTrigger?.() ?? null,
  );
  const selectLockRef = useRef(false);

  const isPathTrigger = trigger?.kind === "path";
  const pathSearchTarget = resolveT3TeamComposerPathSearchTarget(trigger, input.pathSearch);
  const pathEntries = useComposerPathSearch(pathSearchTarget);

  const sharedItems = useMemo(
    () =>
      buildT3TeamComposerMenuItems(trigger, {
        ...input.sources,
        pathEntries: pathEntries.entries,
      }),
    [input.sources, pathEntries.entries, trigger],
  );
  const buildExtraItems = input.buildExtraItems;
  const menuItems = useMemo<ReadonlyArray<T3TeamComposerMenuItem>>(() => {
    const extraItems = trigger && buildExtraItems ? buildExtraItems(trigger) : [];
    // Extra items (recipe launchers) MUST come after the shared items: a
    // project recipe may never appear to shadow a host command
    // (docs/t3team-mvp/16-action-recipes.md#menu-grouping). Since the menu
    // adopted upstream's flat rendering this concatenation order is the only
    // thing enforcing that — see the ordering test in
    // t3team-composerMenuItems.test.ts.
    return extraItems.length > 0 ? [...sharedItems, ...extraItems] : sharedItems;
  }, [buildExtraItems, sharedItems, trigger]);
  const searchKey = trigger ? `${trigger.kind}:${trigger.query.trim().toLowerCase()}` : null;
  const highlight = useT3TeamComposerMenuHighlight(menuItems, searchKey);

  const handleEditorChange = useCallback(
    (nextValue: string, expandedCursor: number, cursorAdjacentToMention: boolean) => {
      setTrigger(cursorAdjacentToMention ? null : detectComposerTrigger(nextValue, expandedCursor));
    },
    [],
  );

  const selectItem = useCallback(
    (item: T3TeamComposerMenuItem) => {
      if (selectLockRef.current) return;
      selectLockRef.current = true;
      window.requestAnimationFrame(() => {
        selectLockRef.current = false;
      });
      const snapshot = input.readSnapshot();
      const activeTrigger = detectComposerTrigger(snapshot.value, snapshot.expandedCursor);
      if (!activeTrigger) return;
      const plan = resolveT3TeamComposerMenuSelection(item, activeTrigger, snapshot.value);
      if (!plan) return;
      if (plan.effect?.type === "built-in-slash-command") {
        input.onSelectionEffect(plan.effect);
      }
      const applied = applyT3TeamComposerMenuReplacement(snapshot.value, plan.replacement);
      if (!applied) return;
      input.applyText(applied);
      setTrigger(detectComposerTrigger(applied.text, applied.expandedCursor));
      highlight.setHighlightedItemId(null);
      if (plan.effect && plan.effect.type !== "built-in-slash-command") {
        input.onSelectionEffect(plan.effect);
      }
    },
    [highlight, input],
  );

  const setHighlightedItemId = highlight.setHighlightedItemId;

  const resetTrigger = useCallback(() => {
    setTrigger(null);
    setHighlightedItemId(null);
  }, [setHighlightedItemId]);

  /**
   * Re-detects the trigger after the host wrote the editor text itself (draft
   * restore, inline placeholder insert/remove, pending-answer sync). The menu
   * must follow a programmatic write exactly as it follows typing.
   */
  const syncTrigger = useCallback((text: string, expandedCursor: number) => {
    setTrigger(detectComposerTrigger(text, expandedCursor));
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightedItemId(null);
  }, [setHighlightedItemId]);

  const handleCommandKeyDown = useT3TeamComposerMenuKeyboard({
    trigger,
    items: menuItems,
    activeItemId: highlight.activeItemId,
    onHighlightItem: highlight.onHighlightedItemChange,
    onAcceptItem: selectItem,
    onClose: resetTrigger,
  });

  return {
    trigger,
    menuOpen: trigger !== null,
    menuItems,
    activeItemId: highlight.activeItemId,
    isPathSearchPending: isPathTrigger && trigger.query.length > 0 && pathEntries.isPending,
    onHighlightedItemChange: highlight.onHighlightedItemChange,
    handleEditorChange,
    handleCommandKeyDown,
    selectItem,
    resetTrigger,
    syncTrigger,
    clearHighlight,
  };
}
