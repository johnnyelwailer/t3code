import { describe, expect, it } from "vite-plus/test";

import { isBareSpecifier } from "../scripts/t3team-distributionImportResolver.ts";

describe("isBareSpecifier", () => {
  it("rejects Windows and POSIX absolute paths", () => {
    expect(isBareSpecifier("C:\\workspace\\node_modules\\package\\index.js")).toBe(false);
    expect(isBareSpecifier("/workspace/node_modules/package/index.js")).toBe(false);
  });

  it("accepts package imports", () => {
    expect(isBareSpecifier("typebox")).toBe(true);
    expect(isBareSpecifier("@t3team/pack-api")).toBe(true);
  });
});
