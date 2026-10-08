import { describe, expect, it } from "vite-plus/test";

import {
  PR_CODE_TOOLBAR_FULL_MIN_WIDTH,
  PR_CODE_TREE_DOCKED_MIN_WIDTH,
  prCodeTreeDockMinWidth,
} from "./t3team-prCodeLayout.logic";

describe("prCodeTreeDockMinWidth", () => {
  it("keeps the stacked threshold where the overlay used to switch (50rem)", () => {
    expect(prCodeTreeDockMinWidth("stacked")).toBe(50 * 16);
  });

  it("asks for more room before docking beside a split diff", () => {
    expect(prCodeTreeDockMinWidth("split")).toBeGreaterThan(prCodeTreeDockMinWidth("stacked"));
  });

  it("always leaves the docked tree its own minimum", () => {
    for (const layout of ["stacked", "split"] as const) {
      expect(prCodeTreeDockMinWidth(layout)).toBeGreaterThan(PR_CODE_TREE_DOCKED_MIN_WIDTH);
    }
  });

  it("drawers the tree on a phone-width or half-window panel", () => {
    for (const width of [390, 640, 768]) {
      expect(width >= prCodeTreeDockMinWidth("stacked")).toBe(false);
    }
  });
});

describe("PR_CODE_TOOLBAR_FULL_MIN_WIDTH", () => {
  it("compacts the toolbar on a phone but not on a half-window panel", () => {
    expect(390 >= PR_CODE_TOOLBAR_FULL_MIN_WIDTH).toBe(false);
    expect(640 >= PR_CODE_TOOLBAR_FULL_MIN_WIDTH).toBe(true);
  });
});
