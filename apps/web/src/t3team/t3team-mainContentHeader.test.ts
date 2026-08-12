import { describe, expect, it } from "vite-plus/test";

import { getT3TeamMainContentHeaderClassName } from "./t3team-mainContentHeader";

describe("getT3TeamMainContentHeaderClassName", () => {
  it("keeps the standard content padding when the desktop sidebar is open", () => {
    const className = getT3TeamMainContentHeaderClassName();

    expect(className).toContain("px-3");
    expect(className).toContain("sm:px-5");
    expect(className).not.toContain("pl-[90px]");
    expect(className).toContain("wco:pl-[calc(env(titlebar-area-x)+1em)]");
  });

  it("adds the app-title fallback inset when the desktop sidebar is collapsed", () => {
    const className = getT3TeamMainContentHeaderClassName({
      className: "bg-gradient-to-b from-background to-muted/15",
      shouldInsetDesktopHeader: true,
    });

    expect(className).toContain("pl-[var(--workspace-titlebar-content-left)]");
    expect(className).toContain("sm:pl-[var(--workspace-titlebar-content-left)]");
    expect(className).toContain("bg-gradient-to-b");
  });
});
