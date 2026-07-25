import { useCallback, useMemo, useRef, useState } from "react";
import type { EnvironmentId } from "@t3tools/contracts";

import { type ComposerTrigger, detectComposerTrigger } from "~/composer-logic";
import { useComposerPathSearch } from "~/lib/composerPathSearchState";
import { useT3workComposerMenuHighlight } from "~/t3work/composer/t3work-composerMenuHighlightState";
import {
  buildT3workComposerMenuItems,
  type T3workComposerMenuSources,
} from "~/t3work/composer/t3work-composerMenuItems";
import {
  applyT3workComposerMenuReplacement,
  type T3workComposerMenuAppliedText,
} from "~/t3work/composer/t3work-composerMenuApply";
import {
  resolveT3workComposerMenuSelection,
  type T3workComposerMenuSelectionEffect,
} from "~/t3work/composer/t3work-composerMenuSelection";
import type { T3workComposerMenuItem } from "~/t3work/composer/t3work-composerRecipeSlashItems";
import { useT3workComposerMenuKeyboard } from "~/t3work/composer/t3work-useComposerMenuKeyboard";

export type T3workComposerPathSearchScope = {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
};

export type T3workComposerCommandMenuInput = {
  readonly sources: Omit<T3workComposerMenuSources, "pathEntries">;
  readonly pathSearch: T3workComposerPathSearchScope | null;
  /** Reads the live editor text with the expanded (raw-text) cursor position. */
  readonly readSnapshot: () => { readonly value: string; readonly expandedCursor: number };
  /** Writes the post-replacement editor text plus its collapsed cursor. */
  readonly applyText: (next: T3workComposerMenuAppliedText) => void;
  readonly onSelectionEffect: (effect: T3workComposerMenuSelectionEffect) => void;
  /**
   * Builds t3work-owned items appended after the shared ones (the recipes
   * group). Called with the live trigger so the query can rank them.
   */
  readonly buildExtraItems?: (trigger: ComposerTrigger) => ReadonlyArray<T3workComposerMenuItem>;
};

/**
 * Shared composer command-menu controller for `/`, `@` and `$` triggers.
 *
 * Consumed by t3work composer surfaces (kickoff today) so they get the same
 * trigger detection, item ranking, highlight rules and keyboard navigation the
 * chat composer implements inline.
 */
export function useT3workComposerCommandMenu(input: T3workComposerCommandMenuInput) {
  const [trigger, setTrigger] = useState<ComposerTrigger | null>(null);
  const selectLockRef = useRef(false);

  const isPathTrigger = trigger?.kind === "path";
  const pathEntries = useComposerPathSearch({
    environmentId: input.pathSearch?.environmentId ?? null,
    cwd: isPathTrigger ? (input.pathSearch?.cwd ?? null) : null,
    query: isPathTrigger ? trigger.query : null,
  });

  const sharedItems = useMemo(
    () =>
      buildT3workComposerMenuItems(trigger, {
        ...input.sources,
        pathEntries: pathEntries.entries,
      }),
    [input.sources, pathEntries.entries, trigger],
  );
  const buildExtraItems = input.buildExtraItems;
  const menuItems = useMemo<ReadonlyArray<T3workComposerMenuItem>>(() => {
    const extraItems = trigger && buildExtraItems ? buildExtraItems(trigger) : [];
    return extraItems.length > 0 ? [...sharedItems, ...extraItems] : sharedItems;
  }, [buildExtraItems, sharedItems, trigger]);
  const searchKey = trigger ? `${trigger.kind}:${trigger.query.trim().toLowerCase()}` : null;
  const highlight = useT3workComposerMenuHighlight(menuItems, searchKey);

  const handleEditorChange = useCallback(
    (nextValue: string, expandedCursor: number, cursorAdjacentToMention: boolean) => {
      setTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(nextValue, expandedCursor),
      );
    },
    [],
  );

  const selectItem = useCallback(
    (item: T3workComposerMenuItem) => {
      if (selectLockRef.current) return;
      selectLockRef.current = true;
      window.requestAnimationFrame(() => {
        selectLockRef.current = false;
      });
      const snapshot = input.readSnapshot();
      const activeTrigger = detectComposerTrigger(snapshot.value, snapshot.expandedCursor);
      if (!activeTrigger) return;
      const plan = resolveT3workComposerMenuSelection(item, activeTrigger, snapshot.value);
      if (!plan) return;
      if (plan.effect?.type === "built-in-slash-command") {
        input.onSelectionEffect(plan.effect);
      }
      const applied = applyT3workComposerMenuReplacement(snapshot.value, plan.replacement);
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

  const resetTrigger = useCallback(() => {
    setTrigger(null);
    highlight.setHighlightedItemId(null);
  }, [highlight]);

  const handleCommandKeyDown = useT3workComposerMenuKeyboard({
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
  };
}
