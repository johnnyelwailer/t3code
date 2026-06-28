import { describe, expect, it } from "vite-plus/test";

import {
  getT3workSidecarSectionComponent,
  resolveT3workSidecarSectionIsEmpty,
} from "~/t3work/t3work-sidecarSectionRegistry";

describe("t3work sidecar section registry", () => {
  it("resolves modern and legacy component keys to recipe-list behavior", () => {
    expect(getT3workSidecarSectionComponent("recipe-list")).toBeTypeOf("function");
    expect(getT3workSidecarSectionComponent("quick-starts")).toBe(
      getT3workSidecarSectionComponent("recipe-list"),
    );
    expect(getT3workSidecarSectionComponent("inline-filters")).toBeTypeOf("function");
    expect(getT3workSidecarSectionComponent("recent-conversations")).toBeTypeOf("function");
  });

  it("treats missing recipe input as empty for recipe-list and inline-filters", () => {
    expect(resolveT3workSidecarSectionIsEmpty("recipe-list", undefined)).toBe(true);
    expect(resolveT3workSidecarSectionIsEmpty("quick-starts", undefined)).toBe(true);
    expect(resolveT3workSidecarSectionIsEmpty("inline-filters", undefined)).toBe(true);
  });
});
