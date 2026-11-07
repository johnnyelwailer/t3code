import { describe, expect, it } from "vite-plus/test";

import {
  clampRichChoiceIndex,
  describeRichChoicePosition,
  resolveRichChoiceInitialIndex,
  resolveRichChoiceKey,
  resolveRichChoiceSwipe,
  splitRichChoiceBody,
  toggleRichChoiceSelection,
  type RichChoiceOption,
} from "./t3team-richChoiceLogic.ts";

const options: readonly RichChoiceOption[] = ["a", "b", "c"].map((id) => ({
  id,
  title: id.toUpperCase(),
  body: "x",
}));

describe("rich-choice navigation", () => {
  it("clamps at both ends and tolerates an empty list", () => {
    expect(clampRichChoiceIndex(-3, 5)).toBe(0);
    expect(clampRichChoiceIndex(9, 5)).toBe(4);
    expect(clampRichChoiceIndex(2, 0)).toBe(0);
  });

  it("maps arrow, home and end keys and ignores the rest", () => {
    expect(resolveRichChoiceKey("ArrowRight", 0, 3)).toBe(1);
    expect(resolveRichChoiceKey("ArrowRight", 2, 3)).toBe(2);
    expect(resolveRichChoiceKey("ArrowLeft", 0, 3)).toBe(0);
    expect(resolveRichChoiceKey("Home", 2, 3)).toBe(0);
    expect(resolveRichChoiceKey("End", 0, 3)).toBe(2);
    expect(resolveRichChoiceKey("Enter", 1, 3)).toBeNull();
    expect(resolveRichChoiceKey("ArrowRight", 1, 3, true)).toBe(0);
  });

  it("turns the page only past the drag threshold, one card at a time", () => {
    expect(resolveRichChoiceSwipe(-10, 300, 1, 3)).toBe(1);
    expect(resolveRichChoiceSwipe(-80, 300, 1, 3)).toBe(2);
    expect(resolveRichChoiceSwipe(80, 300, 1, 3)).toBe(0);
    expect(resolveRichChoiceSwipe(-900, 300, 2, 3)).toBe(2);
    expect(resolveRichChoiceSwipe(-20, 100, 0, 3)).toBe(0);
    expect(resolveRichChoiceSwipe(-40, 100, 0, 3)).toBe(1);
    expect(resolveRichChoiceSwipe(80, 300, 1, 3, true)).toBe(2);
  });
});

describe("rich-choice selection", () => {
  it("starts on the default option, falling back to the first", () => {
    expect(resolveRichChoiceInitialIndex(options, "c")).toBe(2);
    expect(resolveRichChoiceInitialIndex(options, "missing")).toBe(0);
    expect(resolveRichChoiceInitialIndex(options, undefined)).toBe(0);
  });

  it("replaces the pick when single and toggles when multiple", () => {
    expect(toggleRichChoiceSelection(["a"], "b", false)).toEqual(["b"]);
    expect(toggleRichChoiceSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleRichChoiceSelection(["a", "b"], "a", true)).toEqual(["b"]);
  });

  it("labels positions and splits bodies", () => {
    expect(describeRichChoicePosition(1, 5, "Engineer")).toBe("2 of 5: Engineer");
    expect(splitRichChoiceBody("one\n\n\n two \n\n")).toEqual(["one", "two"]);
  });
});
