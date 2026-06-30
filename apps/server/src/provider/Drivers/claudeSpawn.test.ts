import { describe, expect, it } from "vite-plus/test";

import { claudeCodeSpawnOptions } from "./claudeSpawn.ts";

describe("claudeCodeSpawnOptions", () => {
  it("does not override the SDK spawn on non-Windows platforms", () => {
    expect(claudeCodeSpawnOptions("linux")).toEqual({});
    expect(claudeCodeSpawnOptions("darwin")).toEqual({});
  });

  it("installs the spawn override only on Windows", () => {
    const options = claudeCodeSpawnOptions("win32");
    expect(typeof options.spawnClaudeCodeProcess).toBe("function");
  });
});
