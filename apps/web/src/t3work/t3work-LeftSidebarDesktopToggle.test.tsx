import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { T3workLeftSidebarDesktopToggle } from "./t3work-LeftSidebarDesktopToggle";

const sidebarState = vi.hoisted(() => ({
  isMobile: false,
  open: true,
  toggleSidebar: () => {},
}));

vi.mock("~/t3work/components/ui/t3work-sidebar", () => ({
  useSidebar: () => sidebarState,
}));

describe("T3workLeftSidebarDesktopToggle", () => {
  it("renders nothing when the desktop left sidebar is open because the header control owns that state", () => {
    sidebarState.isMobile = false;
    sidebarState.open = true;

    expect(renderToStaticMarkup(<T3workLeftSidebarDesktopToggle />)).toBe("");
  });

  it("renders an expand control when the desktop left sidebar is collapsed", () => {
    sidebarState.isMobile = false;
    sidebarState.open = false;

    const markup = renderToStaticMarkup(<T3workLeftSidebarDesktopToggle />);

    expect(markup).toContain("Expand left sidebar");
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("bottom:0.5rem");
    expect(markup).toContain("left:max(env(titlebar-area-x, 0px), 0.5rem)");
  });

  it("renders nothing on mobile because the header triggers already handle that case", () => {
    sidebarState.isMobile = true;
    sidebarState.open = true;

    expect(renderToStaticMarkup(<T3workLeftSidebarDesktopToggle />)).toBe("");
  });
});
