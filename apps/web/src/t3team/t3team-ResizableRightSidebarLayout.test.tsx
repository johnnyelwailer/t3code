import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const mediaQuery = vi.hoisted(() => ({ isDesktop: false }));
vi.mock("~/t3team/hooks/t3team-useMediaQuery", () => ({
  useMediaQuery: () => mediaQuery.isDesktop,
}));

import { ResizableRightSidebarLayout } from "./t3team-ResizableRightSidebarLayout";

describe("ResizableRightSidebarLayout", () => {
  it("shows only the main panel on mobile by default", () => {
    const markup = renderToStaticMarkup(
      <ResizableRightSidebarLayout
        storageKey="t3team_test_sidebar"
        mobileMainLabel="Details"
        mobileAsideLabel="Agent"
        main={<div>main-panel</div>}
        aside={<div>aside-panel</div>}
      />,
    );

    expect(markup).toContain("Agent");
    expect(markup).toContain("main-panel");
    expect(markup).not.toContain("aside-panel");
  });

  it("keeps the main view on screen when the aside opens as a drawer", () => {
    const markup = renderToStaticMarkup(
      <ResizableRightSidebarLayout
        storageKey="t3team_test_sidebar"
        mobileDefaultPanel="aside"
        mobileMainLabel="My work"
        mobileAsideLabel="Chat"
        main={<div>main-panel</div>}
        aside={<div>aside-panel</div>}
      />,
    );

    // No tabs swap the view out: the drawer rises over it, and its bar says what it holds.
    expect(markup).toContain("main-panel");
    expect(markup).toContain("Chat");
  });

  describe("desktop layout", () => {
    const renderDesktop = (defaultCollapsed: boolean) => {
      // `lg` matches: the side-by-side layout (and its floating toggle) renders.
      mediaQuery.isDesktop = true;
      try {
        return renderToStaticMarkup(
          <ResizableRightSidebarLayout
            storageKey={`t3team_test_sidebar_${defaultCollapsed}`}
            defaultCollapsed={defaultCollapsed}
            main={<div>main-panel</div>}
            aside={<div>aside-panel</div>}
          />,
        );
      } finally {
        mediaQuery.isDesktop = false;
      }
    };

    // Main-content headers reserve the floating toggle's footprint off this marker.
    it("marks a collapsed aside on the layout root", () => {
      const markup = renderDesktop(true);
      expect(markup).toContain('data-right-sidebar="collapsed"');
      expect(markup).toContain(
        "--right-sidebar-toggle-inset:calc(var(--workspace-controls-right) + var(--workspace-titlebar-control-size) + 0.5rem)",
      );
      expect(markup).toContain("Expand right sidebar");
    });

    it("marks an expanded aside on the layout root", () => {
      const markup = renderDesktop(false);
      expect(markup).toContain('data-right-sidebar="expanded"');
      expect(markup).toContain("Collapse right sidebar");
    });
  });
});
