import { describe, expect, it } from "vitest";

import { resolveProjectSidebarBrandInset } from "./t3team-ProjectSidebarHeader";

describe("resolveProjectSidebarBrandInset", () => {
  it("uses only the traffic-light clearance on macOS desktop", () => {
    expect(
      resolveProjectSidebarBrandInset({
        isMac: true,
        isDesktop: true,
        isWindowControlsOverlay: false,
      }),
    ).toBe("ml-[var(--workspace-controls-left)]");
  });

  it("keeps the titlebar control clearance for macOS web WCO", () => {
    expect(
      resolveProjectSidebarBrandInset({
        isMac: true,
        isDesktop: false,
        isWindowControlsOverlay: true,
      }),
    ).toBe("ml-[var(--workspace-titlebar-content-left)]");
  });

  it.each([
    { isMac: false, isDesktop: true, isWindowControlsOverlay: false },
    { isMac: false, isDesktop: false, isWindowControlsOverlay: false },
    { isMac: true, isDesktop: false, isWindowControlsOverlay: false },
  ])("keeps normal sidebar alignment for Windows, Linux, and plain web", (input) => {
    expect(resolveProjectSidebarBrandInset(input)).toBe(
      "md:ml-[calc(var(--sidebar-content-inset)+var(--sidebar-row-content-inset))]",
    );
  });
});
