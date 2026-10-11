import { describe, expect, it } from "vite-plus/test";

import { getPreviewPanelMaxWidth } from "./PreviewPanelShell";

describe("getPreviewPanelMaxWidth", () => {
  it("falls back to 70% of the window only while the row is unmeasured", () => {
    expect(getPreviewPanelMaxWidth(6_000)).toBe(4_200);
  });

  it("rounds fractional CSS pixels down", () => {
    expect(getPreviewPanelMaxWidth(2_001)).toBe(1_400);
  });

  it("reserves the sibling column minimum when the flex row is known", () => {
    // Fullscreen 14" MacBook: viewport 1512, sidebar ~256 → row of 1256.
    // The 70% fraction (1058) would leave the chat column only ~198px;
    // the container clamp caps the panel at 1256 − 360 instead.
    expect(getPreviewPanelMaxWidth(1_512, 1_256)).toBe(896);
  });

  it("caps against the row only once it is known, not a fraction of the window", () => {
    // Wide row: the old 70%-of-window cap (2100) stopped the drag 440px early.
    expect(getPreviewPanelMaxWidth(3_000, 2_900)).toBe(2_540);
    // Left sidebar open on a 2560 window: row 2304 → 1944, where 70% of the window (1792)
    // used to stop the drag while the chat column still had room to give.
    expect(getPreviewPanelMaxWidth(2_560, 2_304)).toBe(1_944);
    // Sidebar closed: the whole window is the row, and the panel may grow to row − 360.
    expect(getPreviewPanelMaxWidth(1_920, 1_920)).toBe(1_560);
  });

  it("ignores the window width entirely when the row is known", () => {
    expect(getPreviewPanelMaxWidth(800, 1_600)).toBe(getPreviewPanelMaxWidth(6_000, 1_600));
  });

  it("rounds fractional row widths down", () => {
    expect(getPreviewPanelMaxWidth(1_512, 1_256.6)).toBe(896);
  });

  it("never drops below the panel minimum when the row cannot fit both columns", () => {
    // ~1000px window with an expanded sidebar → row of 700. The sibling
    // reservation (700 − 360 = 340) would undercut the panel's own 360
    // minimum and invert the resize clamp, so the floor wins.
    expect(getPreviewPanelMaxWidth(1_000, 700)).toBe(360);
  });

  it("stays at the panel minimum even when the row is narrower than the reservation", () => {
    expect(getPreviewPanelMaxWidth(1_512, 300)).toBe(360);
  });
});
