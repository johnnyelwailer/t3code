/**
 * Head/tail truncation for the live workflow card's top-level step list (each `RenderUnit` — a
 * plan/runtime row or an already-folded dynamic group, see `t3team-workflowShapeStepGrouping.tsx`
 * — counts as one "entry"). A long run can carry dozens of authored phases even with no repeats;
 * showing every one of them is DOM nobody scrolls to the middle of, so the card shows the first
 * {@link WORKFLOW_TOP_HEAD_ROWS} and the last {@link WORKFLOW_TOP_TAIL_ROWS} by default and folds
 * the rest behind an "… N earlier" affordance (`t3team-WorkflowShapeStepRows.tsx`).
 *
 * Expansion pages in from the TAIL side of the hidden middle, {@link WORKFLOW_TOP_PAGE_SIZE} at a
 * time — the same "keep what's closest to the live edge visible" call as the dynamic-group cap
 * (GHE #406, `t3team-workflowShapeStepGroupCollapsed.tsx`): the entries just before what is
 * already visible are more likely to matter than the ones furthest back, so each click grows the
 * visible tail backward instead of revealing from the start forward.
 */

export const WORKFLOW_TOP_HEAD_ROWS = 3;
export const WORKFLOW_TOP_TAIL_ROWS = 3;
export const WORKFLOW_TOP_PAGE_SIZE = 10;

export interface TopLevelStepVisibility {
  /** Whether the list is long enough to truncate at all. */
  readonly truncated: boolean;
  /** Exclusive end of the always-visible head slice. */
  readonly headEnd: number;
  /** Inclusive start of the currently-visible tail slice (shrinks as more of the middle reveals). */
  readonly tailStart: number;
  /** Entries still folded behind the affordance. */
  readonly hiddenCount: number;
}

/**
 * Pure so the truncation math can be asserted without rendering. `revealedCount` is how many
 * middle entries the reader has already paged in, closest-to-tail first.
 */
export function topLevelStepVisibility(
  total: number,
  revealedCount: number,
): TopLevelStepVisibility {
  if (total <= WORKFLOW_TOP_HEAD_ROWS + WORKFLOW_TOP_TAIL_ROWS) {
    return { truncated: false, headEnd: total, tailStart: total, hiddenCount: 0 };
  }
  const middleLength = total - WORKFLOW_TOP_HEAD_ROWS - WORKFLOW_TOP_TAIL_ROWS;
  const clampedRevealed = Math.min(Math.max(revealedCount, 0), middleLength);
  const hiddenCount = middleLength - clampedRevealed;
  return {
    truncated: true,
    headEnd: WORKFLOW_TOP_HEAD_ROWS,
    tailStart: WORKFLOW_TOP_HEAD_ROWS + hiddenCount,
    hiddenCount,
  };
}
