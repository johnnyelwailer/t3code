import { describe, expect, it } from "vite-plus/test";

import {
  resizeBrowserViewportFromRail,
  resolveBrowserDeviceViewportLayout,
  resolveBrowserViewportLayout,
  resolveFittedBrowserViewport,
} from "./browserViewportLayout";

describe("resolveBrowserViewportLayout", () => {
  it("preserves the last logical viewport when fitting a fill-mode surface", () => {
    expect(
      resolveFittedBrowserViewport({ _tag: "fill" }, { width: 320, height: 200, scale: 0.25 }),
    ).toEqual({ _tag: "freeform", width: 1280, height: 800 });
  });

  it("holds a pinned scale instead of re-fitting to a new panel size", () => {
    const setting = { _tag: "freeform", width: 1440, height: 900 } as const;
    const atDragStart = resolveBrowserViewportLayout({ width: 600, height: 700 }, setting);
    const midDrag = resolveBrowserViewportLayout(
      { width: 900, height: 700 },
      setting,
      1,
      atDragStart.viewportScale,
    );
    expect(midDrag.viewportScale).toBe(atDragStart.viewportScale);
    expect(midDrag.viewportWidth).toBeCloseTo(600);
    // The canvas still follows the panel, and the held viewport stays centered in it.
    expect(midDrag).toMatchObject({ canvasWidth: 900, viewportX: 150 });
    // Unpinned, the same size re-fits once.
    expect(resolveBrowserViewportLayout({ width: 900, height: 700 }, setting).viewportScale).toBe(
      0.625,
    );
  });

  it("never pins the scale in fill mode", () => {
    expect(
      resolveBrowserViewportLayout({ width: 900, height: 700 }, { _tag: "fill" }, 1, 0.5),
    ).toMatchObject({ viewportScale: 1, viewportWidth: 900, fillsPanel: true });
  });

  it("pins the scale inside the device-toolbar rails too", () => {
    const setting = { _tag: "freeform", width: 1440, height: 900 } as const;
    const layout = resolveBrowserDeviceViewportLayout({ width: 900, height: 700 }, setting, 1, 0.4);
    expect(layout.viewportScale).toBe(0.4);
    expect(layout.viewportWidth).toBeCloseTo(576);
  });

  it("keeps the grabbed rail under the pointer across centered layout boundaries", () => {
    const available = { width: 1120, height: 818 };
    expect(
      resizeBrowserViewportFromRail(
        { width: 1120, height: 818 },
        { x: -100, y: -50 },
        available,
        1,
        "southeast",
      ),
    ).toEqual({ width: 920, height: 718 });
    expect(
      resizeBrowserViewportFromRail(
        { width: 800, height: 600 },
        { x: 300, y: 0 },
        { width: 1200, height: 800 },
        1,
        "east",
      ),
    ).toEqual({ width: 1300, height: 600 });
    expect(
      resizeBrowserViewportFromRail(
        { width: 560, height: 409 },
        { x: -100, y: 0 },
        available,
        2,
        "east",
      ),
    ).toEqual({ width: 460, height: 409 });
  });
});
