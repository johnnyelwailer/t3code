import { describe, expect, it } from "vite-plus/test";

import { isRectOutsideVisibleBounds } from "./t3team-useAutoScrollIntoView";

describe("isRectOutsideVisibleBounds", () => {
  it("returns false when the item is already fully visible", () => {
    expect(
      isRectOutsideVisibleBounds(
        { top: 20, bottom: 80, left: 10, right: 90 },
        { top: 0, bottom: 100, left: 0, right: 100 },
      ),
    ).toBe(false);
  });

  it("returns true when the item is clipped above the viewport", () => {
    expect(
      isRectOutsideVisibleBounds(
        { top: -5, bottom: 40, left: 10, right: 90 },
        { top: 0, bottom: 100, left: 0, right: 100 },
      ),
    ).toBe(true);
  });

  it("returns true when the item is clipped below the viewport", () => {
    expect(
      isRectOutsideVisibleBounds(
        { top: 20, bottom: 120, left: 10, right: 90 },
        { top: 0, bottom: 100, left: 0, right: 100 },
      ),
    ).toBe(true);
  });
});
