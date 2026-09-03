/**
 * The loop-iteration cap on a collapsible dynamic group (GHE #403 §5): a `while (true)` body that
 * calls `agent()` per iteration must not render every iteration; the first ten show, the rest sit
 * behind "Show all N".
 */
import { describe, expect, it } from "vite-plus/test";

import {
  visibleGroupRows,
  WORKFLOW_GROUP_VISIBLE_ROWS,
} from "~/t3team/chat/t3team-workflowShapeStepGroupCollapsed";

const rows = (count: number) => Array.from({ length: count }, (_, index) => `row-${index}`);

describe("visibleGroupRows", () => {
  it("shows every row of a group at or under the cap", () => {
    expect(visibleGroupRows(rows(WORKFLOW_GROUP_VISIBLE_ROWS), false)).toEqual({
      visible: rows(WORKFLOW_GROUP_VISIBLE_ROWS),
      hidden: 0,
    });
    expect(visibleGroupRows(rows(4), false).hidden).toBe(0);
  });

  it("caps a long group at the first ten rows and counts the rest", () => {
    const { visible, hidden } = visibleGroupRows(rows(1000), false);
    expect(visible).toEqual(rows(10));
    expect(hidden).toBe(990);
  });

  it("shows all rows once the reader expands", () => {
    const { visible, hidden } = visibleGroupRows(rows(37), true);
    expect(visible).toHaveLength(37);
    expect(hidden).toBe(0);
  });
});
