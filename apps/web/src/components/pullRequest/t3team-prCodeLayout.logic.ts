/**
 * Width rules for the PR Code tab, kept out of the upstream-derived `PullRequestCodeTab.tsx` so
 * the numbers can be tuned (and tested) without touching that file on every upstream sync.
 *
 * Every threshold is compared against the width the Code tab actually has — the row under its
 * toolbar, or the toolbar itself — never the window: the tab can sit in a half-window side panel,
 * an undocked window, or a phone, and only its own box says how much room there is.
 */

/** The file tree's own narrowest usable width when docked beside the diff. */
export const PR_CODE_TREE_DOCKED_MIN_WIDTH = 14 * 16;

/**
 * How much the diff needs beside a docked tree before it stops being worth reading. A split
 * diff draws two columns of code, so it needs roughly twice the room of a stacked one.
 */
const PR_CODE_DIFF_MIN_WIDTH = { stacked: 36 * 16, split: 50 * 16 } as const;

export type PrCodeDiffLayout = keyof typeof PR_CODE_DIFF_MIN_WIDTH;

/**
 * The narrowest Code-tab row that still docks the tree beside the diff. Below it the tree opens
 * as a drawer over the diff instead, so neither pane is squeezed and nothing is pushed past the
 * right edge.
 */
export function prCodeTreeDockMinWidth(layout: PrCodeDiffLayout): number {
  return PR_CODE_TREE_DOCKED_MIN_WIDTH + PR_CODE_DIFF_MIN_WIDTH[layout];
}

/**
 * The narrowest toolbar that still shows every diff control inline. Below it the secondary
 * toggles (whitespace, wrapping, layout, collapse-all) move into the View options menu, so the
 * file-tree toggle and the menu itself are never clipped off the right edge.
 */
export const PR_CODE_TOOLBAR_FULL_MIN_WIDTH = 36 * 16;
