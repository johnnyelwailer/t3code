import { describe, expect, it } from "vite-plus/test";

import { isScaffoldPath, T3_GITIGNORE_LINES } from "./t3team-linkedCheckoutBranch.ts";

describe("scaffold files T3 may remove to switch a linked checkout", () => {
  it("recognises the state dir under every name this product has used", () => {
    for (const path of [
      "AGENTS.md",
      "CLAUDE.md",
      ".agents/nexi/recipes/a/recipe.ts",
      ".nexi/machine.json",
      ".t3team/context/x.json",
    ]) {
      expect(isScaffoldPath(path)).toBe(true);
    }
  });

  it("leaves neighbours alone: other .agents content and user files", () => {
    for (const path of [
      ".agents/skills/x/SKILL.md",
      ".agents/nexi-x",
      "src/index.ts",
      ".github/a",
    ]) {
      expect(isScaffoldPath(path)).toBe(false);
    }
  });

  it("still knows the .gitignore lines an older build wrote", () => {
    for (const line of [
      ".agents/nexi/",
      ".agents/nexi/references/",
      ".nexi/",
      ".nexi/references/",
      ".nexi/child-session-worktrees/",
      ".nexi/context/_blobs/",
      ".t3team/",
    ]) {
      expect(T3_GITIGNORE_LINES.has(line)).toBe(true);
    }
    expect(T3_GITIGNORE_LINES.has("node_modules/")).toBe(false);
  });
});
