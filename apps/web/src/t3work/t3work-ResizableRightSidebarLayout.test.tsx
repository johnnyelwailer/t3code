import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResizableRightSidebarLayout } from "./t3work-ResizableRightSidebarLayout";

describe("ResizableRightSidebarLayout", () => {
  it("shows only the main panel on mobile by default", () => {
    const markup = renderToStaticMarkup(
      <ResizableRightSidebarLayout
        storageKey="t3work_test_sidebar"
        mobileMainLabel="Details"
        mobileAsideLabel="Agent"
        main={<div>main-panel</div>}
        aside={<div>aside-panel</div>}
      />,
    );

    expect(markup).toContain("Details");
    expect(markup).toContain("Agent");
    expect(markup).toContain("main-panel");
    expect(markup).not.toContain("aside-panel");
  });

  it("can default to the sidecar panel on mobile when chat context is active", () => {
    const markup = renderToStaticMarkup(
      <ResizableRightSidebarLayout
        storageKey="t3work_test_sidebar"
        mobileDefaultPanel="aside"
        mobileMainLabel="My work"
        mobileAsideLabel="Chat"
        main={<div>main-panel</div>}
        aside={<div>aside-panel</div>}
      />,
    );

    expect(markup).toContain("My work");
    expect(markup).toContain("Chat");
    expect(markup).toContain("aside-panel");
    expect(markup).not.toContain("main-panel");
  });
});
