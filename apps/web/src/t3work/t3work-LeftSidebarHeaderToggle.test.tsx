import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { T3workLeftSidebarHeaderToggle } from "./t3work-LeftSidebarHeaderToggle";

const sidebarState = vi.hoisted(() => ({
  isMobile: false,
  open: true,
  toggleSidebar: () => {},
}));

vi.mock("~/t3work/components/ui/t3work-sidebar", () => ({
  useSidebar: () => sidebarState,
}));

vi.mock("~/t3work/components/ui/t3work-button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

describe("T3workLeftSidebarHeaderToggle", () => {
  it("renders a subtle icon-only footer collapse button when the desktop sidebar is open", () => {
    sidebarState.isMobile = false;
    sidebarState.open = true;

    const markup = renderToStaticMarkup(<T3workLeftSidebarHeaderToggle />);

    expect(markup).toContain("Collapse left sidebar");
    expect(markup).toContain("size-4");
    expect(markup).not.toContain(">Collapse sidebar<");
  });

  it("renders nothing when the desktop sidebar is already collapsed", () => {
    sidebarState.isMobile = false;
    sidebarState.open = false;

    expect(renderToStaticMarkup(<T3workLeftSidebarHeaderToggle />)).toBe("");
  });

  it("renders nothing on mobile", () => {
    sidebarState.isMobile = true;
    sidebarState.open = true;

    expect(renderToStaticMarkup(<T3workLeftSidebarHeaderToggle />)).toBe("");
  });
});
