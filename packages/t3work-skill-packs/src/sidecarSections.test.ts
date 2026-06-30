import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_BUNDLED_PROFILE_SIDECAR_COMPOSITION,
  DEFAULT_SIDECAR_COMPOSITION,
  listBundledSidecarSections,
} from "./sidecarSections.js";

describe("bundled sidecar sections", () => {
  it("registers topic section instances with recipe-list and inline-filters components", () => {
    const sections = listBundledSidecarSections();
    expect(sections.map((section) => section.id)).toEqual([
      "filters",
      "quick-actions",
      "qa",
      "refinement",
      "planning",
      "engineering",
      "delivery",
      "customize",
      "recent",
    ]);
    expect(sections.find((section) => section.id === "filters")?.component).toBe("inline-filters");
    expect(sections.find((section) => section.id === "qa")?.component).toBe("recipe-list");
    expect(sections.find((section) => section.id === "recent")?.component).toBe(
      "recent-conversations",
    );
  });

  it("shares the same default composition for bundled defaults and profiles", () => {
    expect(DEFAULT_SIDECAR_COMPOSITION).toEqual(DEFAULT_BUNDLED_PROFILE_SIDECAR_COMPOSITION);
    expect(
      DEFAULT_BUNDLED_PROFILE_SIDECAR_COMPOSITION.sections.map((section) => section.sectionId),
    ).toEqual([
      "filters",
      "quick-actions",
      "qa",
      "refinement",
      "planning",
      "engineering",
      "delivery",
      "customize",
      "recent",
    ]);
    expect(
      DEFAULT_BUNDLED_PROFILE_SIDECAR_COMPOSITION.sections.find(
        (section) => section.sectionId === "recent",
      )?.collapsed,
    ).toBe(true);
  });
});
