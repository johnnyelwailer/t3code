import { describe, expect, it } from "vite-plus/test";

import { digestLaneLayout } from "~/t3team/t3team-projectMyWorkDigestLaneLayout";

describe("digestLaneLayout", () => {
  it("splits into two container-aware columns only when both lanes have content", () => {
    const layout = digestLaneLayout({ side: 2, main: 5 });
    expect(layout).toMatchObject({ showSide: true, showMain: true });
    expect(layout.gridClassName).toContain(
      "@6xl/digest:grid-cols-[minmax(16rem,2fr)_minmax(0,5fr)]",
    );
    expect(layout.gridClassName).not.toMatch(/(^|\s)xl:/);
  });

  it.each([
    ["side only", { side: 3, main: 0 }, { showSide: true, showMain: false }],
    ["main only", { side: 0, main: 3 }, { showSide: false, showMain: true }],
  ])("gives a single lane the full width (%s)", (_label, counts, shown) => {
    const layout = digestLaneLayout(counts);
    expect(layout).toMatchObject(shown);
    expect(layout.gridClassName).toContain("grid-cols-1");
    expect(layout.gridClassName).not.toContain("minmax");
  });
});
