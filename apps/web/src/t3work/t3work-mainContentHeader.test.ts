import { describe, expect, it } from "vitest";

import { getT3workMainContentHeaderClassName } from "./t3work-mainContentHeader";

describe("getT3workMainContentHeaderClassName", () => {
  it("keeps the standard content padding when the desktop sidebar is open", () => {
    const className = getT3workMainContentHeaderClassName();

    expect(className).toContain("px-3");
    expect(className).toContain("sm:px-5");
    expect(className).not.toContain("pl-[90px]");
    expect(className).toContain("wco:pl-[calc(env(titlebar-area-x)+1em)]");
  });

  it("adds the app-title fallback inset when the desktop sidebar is collapsed", () => {
    const className = getT3workMainContentHeaderClassName({
      className: "bg-gradient-to-b from-background to-muted/15",
      shouldInsetDesktopHeader: true,
    });

    expect(className).toContain("pl-[90px]");
    expect(className).toContain("sm:pl-[90px]");
    expect(className).toContain("bg-gradient-to-b");
  });
});
