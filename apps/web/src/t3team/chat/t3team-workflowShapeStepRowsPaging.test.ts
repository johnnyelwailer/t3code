/**
 * Head/tail truncation math for the top-level workflow step list (see
 * `t3team-workflowShapeStepRowsPaging.ts`): a short run renders every entry; a long run shows the
 * first three and last three with the rest folded, and paging reveals ten more at a time, closest
 * to the tail first, until nothing is hidden.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  topLevelStepVisibility,
  WORKFLOW_TOP_HEAD_ROWS,
  WORKFLOW_TOP_PAGE_SIZE,
  WORKFLOW_TOP_TAIL_ROWS,
} from "~/t3team/chat/t3team-workflowShapeStepRowsPaging";

describe("topLevelStepVisibility", () => {
  it("does not truncate a run at or under head+tail", () => {
    const total = WORKFLOW_TOP_HEAD_ROWS + WORKFLOW_TOP_TAIL_ROWS;
    expect(topLevelStepVisibility(total, 0)).toEqual({
      truncated: false,
      headEnd: total,
      tailStart: total,
      hiddenCount: 0,
    });
    expect(topLevelStepVisibility(total - 2, 0).truncated).toBe(false);
  });

  it("folds the middle of a long run behind the head and tail", () => {
    const visibility = topLevelStepVisibility(20, 0);
    expect(visibility.truncated).toBe(true);
    expect(visibility.headEnd).toBe(WORKFLOW_TOP_HEAD_ROWS);
    expect(visibility.hiddenCount).toBe(20 - WORKFLOW_TOP_HEAD_ROWS - WORKFLOW_TOP_TAIL_ROWS);
    expect(visibility.tailStart).toBe(visibility.headEnd + visibility.hiddenCount);
  });

  it("reveals a page of ten at a time, growing the tail backward", () => {
    const first = topLevelStepVisibility(30, 0);
    const afterOnePage = topLevelStepVisibility(30, WORKFLOW_TOP_PAGE_SIZE);

    expect(afterOnePage.hiddenCount).toBe(first.hiddenCount - WORKFLOW_TOP_PAGE_SIZE);
    expect(afterOnePage.tailStart).toBeLessThan(first.tailStart);
    expect(afterOnePage.headEnd).toBe(first.headEnd);
  });

  it("clamps revealedCount so the affordance disappears once everything is shown", () => {
    const visibility = topLevelStepVisibility(20, 1000);
    expect(visibility.hiddenCount).toBe(0);
    expect(visibility.tailStart).toBe(visibility.headEnd);
  });

  it("never goes negative for a revealedCount below zero", () => {
    const visibility = topLevelStepVisibility(20, -5);
    expect(visibility.hiddenCount).toBe(20 - WORKFLOW_TOP_HEAD_ROWS - WORKFLOW_TOP_TAIL_ROWS);
  });
});
