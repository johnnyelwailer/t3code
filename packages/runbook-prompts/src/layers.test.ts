import { describe, expect, it } from "vite-plus/test";
import { CASCADE_LAYER_PRECEDENCE, layerDir } from "./layers.js";

describe("CASCADE_LAYER_PRECEDENCE", () => {
  it("is defaults < catalog < project, low to high precedence", () => {
    expect(CASCADE_LAYER_PRECEDENCE).toEqual(["defaults", "catalog", "project"]);
  });

  it("never includes instance — config-only, cannot contribute a prompt/logic", () => {
    expect(CASCADE_LAYER_PRECEDENCE).not.toContain("instance");
  });
});

describe("layerDir", () => {
  it("returns defaultsDir/catalogDir/projectDir for their own layers", () => {
    const config = { defaultsDir: "/defaults", catalogDir: "/catalog", projectDir: "/project" };
    expect(layerDir(config, "defaults")).toBe("/defaults");
    expect(layerDir(config, "catalog")).toBe("/catalog");
    expect(layerDir(config, "project")).toBe("/project");
  });

  it("returns undefined for optional layers left unconfigured", () => {
    const config = { defaultsDir: "/defaults" };
    expect(layerDir(config, "catalog")).toBeUndefined();
    expect(layerDir(config, "project")).toBeUndefined();
  });

  it("always returns undefined for instance — no directory can ever exist for it", () => {
    const config = { defaultsDir: "/defaults", catalogDir: "/catalog", projectDir: "/project" };
    expect(layerDir(config, "instance")).toBeUndefined();
  });
});
