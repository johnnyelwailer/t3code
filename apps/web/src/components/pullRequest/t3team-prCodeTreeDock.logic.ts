/**
 * Where the PR Code tab's file tree sits and how wide it is: the reader's two layout choices,
 * and the arithmetic that keeps a dragged width usable. Pure, so the numbers are tested without
 * a pointer.
 */

export type PrTreeDockSide = "left" | "right";

export const PR_TREE_DEFAULT_WIDTH = 20 * 16;
export const PR_TREE_MIN_WIDTH = 14 * 16;
const PR_TREE_MAX_WIDTH = 56 * 16;

/** What the diff keeps however wide the tree is dragged, so it never drops to a sliver. */
const PR_TREE_DIFF_RESERVE = 20 * 16;

/**
 * The docked tree's width ceiling as CSS, from the same reserve as the drag limit: a width
 * stored in a wider window must not squeeze the diff in a narrower one, and a second, different
 * cap would show a pane narrower than the width the handle reports.
 */
export const PR_TREE_DOCKED_MAX_WIDTH = `calc(100% - ${PR_TREE_DIFF_RESERVE}px)`;

/** One arrow press on the resize handle. */
export const PR_TREE_KEYBOARD_STEP = 16;

export function oppositeDockSide(side: PrTreeDockSide): PrTreeDockSide {
  return side === "left" ? "right" : "left";
}

/** The widest the tree may be in a row of this width, never narrower than its own minimum. */
export function prTreeMaxWidth(rowWidth: number): number {
  return Math.max(PR_TREE_MIN_WIDTH, Math.min(PR_TREE_MAX_WIDTH, rowWidth - PR_TREE_DIFF_RESERVE));
}

export function clampPrTreeWidth(width: number, rowWidth: number): number {
  return Math.max(PR_TREE_MIN_WIDTH, Math.min(prTreeMaxWidth(rowWidth), width));
}

/**
 * The handle sits on the tree's inner edge, so dragging it away from the tree's own side
 * widens it: leftwards for a tree on the right, rightwards for one on the left.
 */
export function prTreeWidthAfterDrag(input: {
  readonly startWidth: number;
  readonly deltaX: number;
  readonly side: PrTreeDockSide;
  readonly rowWidth: number;
}): number {
  const growth = input.side === "right" ? -input.deltaX : input.deltaX;
  return clampPrTreeWidth(input.startWidth + growth, input.rowWidth);
}

/** An arrow key's width change: the arrow pointing away from the tree's side widens it. */
export function prTreeKeyboardDelta(key: string, side: PrTreeDockSide): number {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return 0;
  const towardsDiff = side === "right" ? "ArrowLeft" : "ArrowRight";
  return key === towardsDiff ? PR_TREE_KEYBOARD_STEP : -PR_TREE_KEYBOARD_STEP;
}
