import { describe, expect, it } from "vite-plus/test";

import {
  COLLAPSED_RIGHT_SIDEBAR_TITLEBAR_INSET_CLASS,
  getT3TeamMainContentHeaderClassName,
} from "./t3team-mainContentHeader";

describe("getT3TeamMainContentHeaderClassName", () => {
  it("keeps the standard content padding when the desktop sidebar is open", () => {
    const className = getT3TeamMainContentHeaderClassName();

    expect(className).toContain("px-3");
    expect(className).toContain("sm:px-5");
    expect(className).not.toContain("pl-[90px]");
    expect(className).toContain("wco:pl-(--workspace-controls-left)");
  });

  // The header lies inside the window drag strip's band; without `.drag-region`
  // its buttons, links and inputs would not opt out and could not be clicked.
  it("is a drag region so its controls stay clickable under the window drag strip", () => {
    const className = getT3TeamMainContentHeaderClassName({
      shouldInsetDesktopHeader: true,
    });

    expect(className.split(" ")).toContain("drag-region");
  });

  it("adds the app-title fallback inset when the desktop sidebar is collapsed", () => {
    const className = getT3TeamMainContentHeaderClassName({
      className: "bg-gradient-to-b from-background to-muted/15",
      shouldInsetDesktopHeader: true,
    });

    expect(className).toContain("pl-(--workspace-titlebar-content-left)");
    expect(className).toContain("sm:pl-(--workspace-titlebar-content-left)");
    expect(className).toContain("bg-gradient-to-b");
  });

  // The collapsed right aside's floating toggle sits over the header's right edge on desktop;
  // the reservation must key off the layout's marker so an expanded aside changes nothing.
  it("reserves the right-sidebar toggle only while the aside is collapsed at lg", () => {
    const className = getT3TeamMainContentHeaderClassName();
    const reservation = "pr-(--right-sidebar-toggle-inset)";
    const classes = className.split(" ");

    expect(classes).toContain(`lg:[[data-right-sidebar=collapsed]_&]:${reservation}`);
    // WCO: the reservation must outrank the native-controls-only inset instead of staying short.
    expect(classes).toContain(`wco:lg:[[data-right-sidebar=collapsed]_&]:${reservation}`);
    expect(classes).toContain("wco:pr-(--workspace-native-controls-inset)");
    expect(classes).toContain("sm:px-5");
    // Never unconditional, never for an expanded aside, never below lg.
    const reservations = classes.filter((entry) => entry.includes(reservation));
    expect(reservations).toHaveLength(2);
    for (const entry of reservations) {
      expect(entry).toContain("lg:[[data-right-sidebar=collapsed]_&]:");
      expect(entry).not.toContain("expanded");
    }
    expect(COLLAPSED_RIGHT_SIDEBAR_TITLEBAR_INSET_CLASS.split(" ")).toEqual(reservations);
  });

  it("keeps the right-sidebar reservation alongside the collapsed left-sidebar inset", () => {
    const className = getT3TeamMainContentHeaderClassName({ shouldInsetDesktopHeader: true });

    expect(className).toContain("pl-(--workspace-titlebar-content-left)");
    expect(className).toContain(
      "lg:[[data-right-sidebar=collapsed]_&]:pr-(--right-sidebar-toggle-inset)",
    );
  });
});
