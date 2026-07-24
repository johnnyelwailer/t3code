import {
  collapseExpandedComposerCursor,
  expandCollapsedComposerCursor,
  replaceTextRange,
} from "~/composer-logic";

import type { T3workComposerMenuReplacement } from "~/t3work/composer/t3work-composerMenuSelection";

export type T3workComposerMenuAppliedText = {
  readonly text: string;
  readonly cursor: number;
  readonly expandedCursor: number;
  readonly focusEditorAfterReplace: boolean;
};

/**
 * Applies a resolved replacement to `text`, returning the next editor text with
 * both cursor representations — or `null` when the optimistic `expectedText`
 * check fails because the editor changed since the menu rendered.
 */
export function applyT3workComposerMenuReplacement(
  text: string,
  replacement: T3workComposerMenuReplacement,
): T3workComposerMenuAppliedText | null {
  const safeStart = Math.max(0, Math.min(text.length, replacement.rangeStart));
  const safeEnd = Math.max(safeStart, Math.min(text.length, replacement.rangeEnd));
  if (text.slice(safeStart, safeEnd) !== replacement.expectedText) {
    return null;
  }
  const next = replaceTextRange(
    text,
    replacement.rangeStart,
    replacement.rangeEnd,
    replacement.replacement,
  );
  const cursor = collapseExpandedComposerCursor(next.text, next.cursor);
  return {
    text: next.text,
    cursor,
    expandedCursor: expandCollapsedComposerCursor(next.text, cursor),
    focusEditorAfterReplace: replacement.focusEditorAfterReplace,
  };
}
