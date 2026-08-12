import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ResizableRightSidebarAside } from "./t3team-ResizableRightSidebarAside";

describe("ResizableRightSidebarAside", () => {
  it("uses the shared titlebar control row and reserves the topbar band", () => {
    const markup = renderToStaticMarkup(
      <ResizableRightSidebarAside
        aside={<div>aside-panel</div>}
        asideWidth={384}
        isCollapsed={false}
        onResizePointerDown={() => {}}
        onResizePointerMove={() => {}}
        onResizePointerUp={() => {}}
        onResizePointerCancel={() => {}}
        onToggleCollapsed={() => {}}
      />,
    );

    expect(markup).toContain("workspace-titlebar-controls");
    expect(markup).toContain("pt-[var(--workspace-topbar-height)]");
    expect(markup).toContain('aria-label="Collapse right sidebar"');
  });
});
