import { describe, expect, it } from "vite-plus/test";

import {
  PR_TREE_DOCKED_MAX_WIDTH,
  PR_TREE_KEYBOARD_STEP,
  PR_TREE_MIN_WIDTH,
  clampPrTreeWidth,
  oppositeDockSide,
  prTreeKeyboardDelta,
  prTreeMaxWidth,
  prTreeWidthAfterDrag,
} from "./t3team-prCodeTreeDock.logic";

describe("prTreeMaxWidth", () => {
  it("leaves the diff its reserve in a normal row", () => {
    expect(prTreeMaxWidth(1000)).toBe(680);
  });

  it("caps a very wide row", () => {
    expect(prTreeMaxWidth(4000)).toBe(56 * 16);
  });

  it("never drops below the tree's own minimum in a tight row", () => {
    expect(prTreeMaxWidth(300)).toBe(PR_TREE_MIN_WIDTH);
  });

  it("is the same ceiling the stylesheet applies to a docked tree", () => {
    const reserve = 1000 - prTreeMaxWidth(1000);
    expect(PR_TREE_DOCKED_MAX_WIDTH).toBe(`calc(100% - ${reserve}px)`);
  });
});

describe("clampPrTreeWidth", () => {
  it("holds a stored width that no longer fits the row", () => {
    expect(clampPrTreeWidth(900, 1000)).toBe(680);
  });

  it("holds a width below the minimum", () => {
    expect(clampPrTreeWidth(50, 1000)).toBe(PR_TREE_MIN_WIDTH);
  });
});

describe("prTreeWidthAfterDrag", () => {
  const base = { startWidth: 320, rowWidth: 1200 } as const;

  it("widens a right-docked tree when dragged left", () => {
    expect(prTreeWidthAfterDrag({ ...base, side: "right", deltaX: -80 })).toBe(400);
  });

  it("widens a left-docked tree when dragged right", () => {
    expect(prTreeWidthAfterDrag({ ...base, side: "left", deltaX: 80 })).toBe(400);
  });

  it("stops at the minimum", () => {
    expect(prTreeWidthAfterDrag({ ...base, side: "right", deltaX: 500 })).toBe(PR_TREE_MIN_WIDTH);
  });
});

describe("prTreeKeyboardDelta", () => {
  it("widens with the arrow that points at the diff", () => {
    expect(prTreeKeyboardDelta("ArrowLeft", "right")).toBe(PR_TREE_KEYBOARD_STEP);
    expect(prTreeKeyboardDelta("ArrowRight", "left")).toBe(PR_TREE_KEYBOARD_STEP);
  });

  it("narrows with the other arrow and ignores other keys", () => {
    expect(prTreeKeyboardDelta("ArrowRight", "right")).toBe(-PR_TREE_KEYBOARD_STEP);
    expect(prTreeKeyboardDelta("Enter", "right")).toBe(0);
  });
});

describe("oppositeDockSide", () => {
  it("swaps sides", () => {
    expect(oppositeDockSide("left")).toBe("right");
    expect(oppositeDockSide("right")).toBe("left");
  });
});
