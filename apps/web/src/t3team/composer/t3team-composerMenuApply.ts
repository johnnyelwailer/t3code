import {
  collapseExpandedComposerCursor,
  expandCollapsedComposerCursor,
  replaceTextRange,
} from "~/composer-logic";

import type { T3TeamComposerMenuReplacement } from "~/t3team/composer/t3team-composerMenuSelection";

export type T3TeamComposerMenuAppliedText = {
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
export function applyT3TeamComposerMenuReplacement(
  text: string,
  replacement: T3TeamComposerMenuReplacement,
): T3TeamComposerMenuAppliedText | null {
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
