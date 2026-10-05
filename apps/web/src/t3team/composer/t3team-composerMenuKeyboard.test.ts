import { describe, expect, it } from "vite-plus/test";

import {
  isT3TeamComposerMenuKey,
  resolveT3TeamComposerMenuKey,
} from "~/t3team/composer/t3team-composerMenuKeyboard";

const items = [{ id: "one" }, { id: "two" }, { id: "three" }];

function resolve(
  key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab" | "Escape",
  activeItemId: string | null,
) {
  return resolveT3TeamComposerMenuKey({ key, items, activeItemId });
}

describe("isT3TeamComposerMenuKey", () => {
  it("claims only the menu keys", () => {
    expect(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].every(isT3TeamComposerMenuKey)).toBe(
      true,
    );
    expect(isT3TeamComposerMenuKey("Backspace")).toBe(false);
    expect(isT3TeamComposerMenuKey("a")).toBe(false);
  });
});

describe("resolveT3TeamComposerMenuKey", () => {
  it("moves the highlight down and wraps", () => {
    expect(resolve("ArrowDown", null)).toEqual({ type: "highlight", itemId: "one" });
    expect(resolve("ArrowDown", "one")).toEqual({ type: "highlight", itemId: "two" });
    expect(resolve("ArrowDown", "three")).toEqual({ type: "highlight", itemId: "one" });
  });

  it("moves the highlight up and wraps", () => {
    expect(resolve("ArrowUp", null)).toEqual({ type: "highlight", itemId: "three" });
    expect(resolve("ArrowUp", "two")).toEqual({ type: "highlight", itemId: "one" });
    expect(resolve("ArrowUp", "one")).toEqual({ type: "highlight", itemId: "three" });
  });

  it("accepts the highlighted option on Enter and Tab", () => {
    expect(resolve("Enter", "two")).toEqual({ type: "accept", itemId: "two" });
    expect(resolve("Tab", "two")).toEqual({ type: "accept", itemId: "two" });
  });

  it("accepts the first option when nothing is highlighted yet", () => {
    expect(resolve("Enter", null)).toEqual({ type: "accept", itemId: "one" });
    expect(resolve("Enter", "gone")).toEqual({ type: "accept", itemId: "one" });
  });

  it("closes on Escape even with no options", () => {
    expect(resolve("Escape", "one")).toEqual({ type: "close" });
    expect(resolveT3TeamComposerMenuKey({ key: "Escape", items: [], activeItemId: null })).toEqual({
      type: "close",
    });
  });

  it("ignores navigation and accept keys with no options", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab"] as const) {
      expect(resolveT3TeamComposerMenuKey({ key, items: [], activeItemId: null })).toEqual({
        type: "ignore",
      });
    }
  });
});
