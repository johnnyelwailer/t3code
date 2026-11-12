import { describe, expect, it } from "vite-plus/test";

import { orderedDistributionThemePaths } from "./t3team-packs.distributionThemes.ts";

const manifest = {
  theme: "themes/nexplore.json",
  themes: ["themes/nexplore.json", "themes/nexplore-orange.json", "themes/nexplore-lila.json"],
};

describe("orderedDistributionThemePaths", () => {
  it("lists the default theme first and every theme once", () => {
    expect(orderedDistributionThemePaths(manifest)).toEqual([
      "themes/nexplore.json",
      "themes/nexplore-orange.json",
      "themes/nexplore-lila.json",
    ]);
  });

  it("moves the flavor's choice to the front", () => {
    expect(orderedDistributionThemePaths(manifest, "themes/nexplore-lila.json")[0]).toBe(
      "themes/nexplore-lila.json",
    );
  });

  it("refuses a choice the distribution does not ship", () => {
    expect(() => orderedDistributionThemePaths(manifest, "themes/typo.json")).toThrow(
      "not a theme of the distribution",
    );
  });

  it("keeps a single-theme distribution as it is", () => {
    expect(orderedDistributionThemePaths({ theme: "themes/nexplore.json" })).toEqual([
      "themes/nexplore.json",
    ]);
  });
});
