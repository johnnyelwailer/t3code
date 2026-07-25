import { describe, expect, it } from "vite-plus/test";

import {
  getT3TeamSidecarSectionComponent,
  resolveT3TeamSidecarSectionIsEmpty,
} from "~/t3team/t3team-sidecarSectionRegistry";

describe("t3team sidecar section registry", () => {
  it("resolves modern and legacy component keys to recipe-list behavior", () => {
    expect(getT3TeamSidecarSectionComponent("recipe-list")).toBeTypeOf("function");
    expect(getT3TeamSidecarSectionComponent("quick-starts")).toBe(
      getT3TeamSidecarSectionComponent("recipe-list"),
    );
    expect(getT3TeamSidecarSectionComponent("inline-filters")).toBeTypeOf("function");
    expect(getT3TeamSidecarSectionComponent("recent-conversations")).toBeTypeOf("function");
  });

  it("treats missing recipe input as empty for recipe-list and inline-filters", () => {
    expect(resolveT3TeamSidecarSectionIsEmpty("recipe-list", undefined)).toBe(true);
    expect(resolveT3TeamSidecarSectionIsEmpty("quick-starts", undefined)).toBe(true);
    expect(resolveT3TeamSidecarSectionIsEmpty("inline-filters", undefined)).toBe(true);
  });
});
