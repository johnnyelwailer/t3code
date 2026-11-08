import { describe, expect, it } from "vite-plus/test";

import { getPreviewPanelMaxWidth } from "~/hooks/usePreviewPanelInlineSize";

describe("getPreviewPanelMaxWidth (t3team row-based cap)", () => {
  it("falls back to 70% of the window only while the row is unmeasured", () => {
    expect(getPreviewPanelMaxWidth(6_000)).toBe(4_200);
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
});
