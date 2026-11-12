import { describe, expect, it } from "vite-plus/test";

import {
  isBareSpecifier,
  isDistributionImporter,
} from "../scripts/t3team-distributionImportResolver.ts";

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

describe("isDistributionImporter", () => {
  const input = {
    distributionDir: "/d/nexi-work/pack/nexplore-global",
    workspaceRoot: "/d/vendor/t3code",
  };
  const check = (importerPath: string) => isDistributionImporter({ ...input, importerPath });

  it("covers the pack directory and distribution files the pack reaches into", () => {
    expect(check("/d/nexi-work/pack/nexplore-global/activate.ts")).toBe(true);
    expect(check("/d/nexi-work/broker/agent/forwarder.ts")).toBe(true);
  });

  it("leaves the server's own sources and installed packages alone", () => {
    expect(check("/d/vendor/t3code/apps/server/src/bin.ts")).toBe(false);
    expect(check("/d/node_modules/.pnpm/x/node_modules/x/index.js")).toBe(false);
  });
});
