import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { T3TeamLeftSidebarDesktopToggle } from "./t3team-LeftSidebarDesktopToggle";

const sidebarState = vi.hoisted(() => ({
  isMobile: false,
  open: true,
  toggleSidebar: () => {},
}));

vi.mock("~/t3team/components/ui/t3team-sidebar", () => ({
  useSidebar: () => sidebarState,
}));

describe("T3TeamLeftSidebarDesktopToggle", () => {
  it("renders nothing when the desktop left sidebar is open because the header control owns that state", () => {
    sidebarState.isMobile = false;
    sidebarState.open = true;

    expect(renderToStaticMarkup(<T3TeamLeftSidebarDesktopToggle />)).toBe("");
  });

  it("renders an expand control when the desktop left sidebar is collapsed", () => {
    sidebarState.isMobile = false;
    sidebarState.open = false;

    const markup = renderToStaticMarkup(<T3TeamLeftSidebarDesktopToggle />);

    expect(markup).toContain("Expand left sidebar");
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("bottom:0.5rem");
    expect(markup).toContain("left:max(env(titlebar-area-x, 0px), 0.5rem)");
  });

  it("renders nothing on mobile because the header triggers already handle that case", () => {
    sidebarState.isMobile = true;
    sidebarState.open = true;

    expect(renderToStaticMarkup(<T3TeamLeftSidebarDesktopToggle />)).toBe("");
  });
});
