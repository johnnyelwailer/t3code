import { describe, expect, it } from "vite-plus/test";

import {
  isProjectStatePath,
  LEGACY_NEXI_PROJECT_STATE_DIR,
  projectStateReadDirNames,
} from "./t3team-projectStateLayout.ts";
import { NEXI_PROJECT_STATE_DIR } from "./t3teamProjectStateDir.ts";

describe("project state layout", () => {
  it("reads the new dir first, then the legacy one", () => {
    expect(LEGACY_NEXI_PROJECT_STATE_DIR).toBe(".nexi");
    expect(projectStateReadDirNames(NEXI_PROJECT_STATE_DIR)).toEqual([".agents/nexi", ".nexi"]);
    expect(projectStateReadDirNames(".t3team")).toEqual([".t3team"]);
  });

  it("recognises a path inside any state dir this product has used", () => {
    for (const path of [
      ".agents/nexi/a",
      ".nexi/a",
      ".t3team/a",
      "./.agents/nexi/a",
      ".agents\\nexi\\a",
    ]) {
      expect(isProjectStatePath(path)).toBe(true);
    }
    // Neighbours are not the state dir: a sibling under .agents, a lookalike prefix, a nested one.
    for (const path of [
      ".agents/skills/a",
      ".agents/nexi-x/a",
      ".nexi-dev/a",
      "src/.nexi/a",
      "AGENTS.md",
    ]) {
      expect(isProjectStatePath(path)).toBe(false);
    }
  });
});
