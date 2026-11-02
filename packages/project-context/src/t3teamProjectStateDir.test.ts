import { describe, expect, it } from "vite-plus/test";

import {
  isNexiStateDirEnabled,
  isProjectStatePath,
  LEGACY_NEXI_PROJECT_STATE_DIR,
  NEXI_PROJECT_STATE_DIR,
  NEXI_STATE_DIR_FLAG_ENV,
  PROJECT_STATE_DIR,
  projectStateReadDirNames,
  resolveProjectStateDirName,
  toPhysicalProjectStatePath,
} from "./t3teamProjectStateDir.ts";
import { T3TEAM_PROJECT_CONTEXT_ROOT } from "./t3teamContextPaths.ts";

const env =
  (value: string | undefined) =>
  (key: string): string | undefined =>
    key === NEXI_STATE_DIR_FLAG_ENV ? value : undefined;

describe("project state dir resolver", () => {
  it("names the state dir .agents/nexi by default and for any value that is not an explicit off", () => {
    for (const value of [undefined, "", "   ", "yes", "1", "true", "ON", " on "]) {
      expect(isNexiStateDirEnabled(env(value))).toBe(true);
      expect(resolveProjectStateDirName(env(value))).toBe(".agents/nexi");
    }
  });

  it("names the state dir .t3team when NEXI_FF_NEXI_STATE_DIR is explicitly off", () => {
    for (const value of ["0", "false", "off", " OFF ", "False"]) {
      expect(isNexiStateDirEnabled(env(value))).toBe(false);
      expect(resolveProjectStateDirName(env(value))).toBe(".t3team");
    }
  });

  it("derives the shared context root from the process-wide name", () => {
    expect(T3TEAM_PROJECT_CONTEXT_ROOT).toBe(`${PROJECT_STATE_DIR}/context`);
  });

  it("maps canonical client paths onto the physical dir, idempotently", () => {
    expect(toPhysicalProjectStatePath(".t3team/context/entrypoint.json", ".nexi")).toBe(
      ".nexi/context/entrypoint.json",
    );
    expect(toPhysicalProjectStatePath("./.t3team/recipes/a/recipe.ts", ".nexi")).toBe(
      ".nexi/recipes/a/recipe.ts",
    );
    expect(toPhysicalProjectStatePath(".t3team", ".nexi")).toBe(".nexi");
    expect(toPhysicalProjectStatePath(".nexi/context/x.json", ".nexi")).toBe(
      ".nexi/context/x.json",
    );
    // Neighbours that merely share the prefix are not the state dir.
    expect(toPhysicalProjectStatePath(".t3team-runs/run.json", ".nexi")).toBe(
      ".t3team-runs/run.json",
    );
    expect(toPhysicalProjectStatePath("AGENTS.md", ".nexi")).toBe("AGENTS.md");
    expect(toPhysicalProjectStatePath(".t3team/context/x.json", ".t3team")).toBe(
      ".t3team/context/x.json",
    );
  });

  it("maps absolute paths a client builds under the workspace root", () => {
    expect(toPhysicalProjectStatePath("/ws/app/.t3team/recipes/r/workflow.ts", ".nexi")).toBe(
      "/ws/app/.nexi/recipes/r/workflow.ts",
    );
    expect(toPhysicalProjectStatePath("C:\\ws\\.t3team\\recipes\\r", ".nexi")).toBe(
      "C:\\ws\\.nexi\\recipes\\r",
    );
    expect(toPhysicalProjectStatePath("/ws/.t3team-runs/r/workflow.ts", ".nexi")).toBe(
      "/ws/.t3team-runs/r/workflow.ts",
    );
    expect(toPhysicalProjectStatePath("/ws/my.t3team/x", ".nexi")).toBe("/ws/my.t3team/x");
    // An unrelated ANCESTOR directory named .t3team (e.g. this app's own child-worktree roots)
    // is not the state dir: already-physical paths pass through, and the state-dir segment wins
    // over an ancestor of the same name.
    expect(
      toPhysicalProjectStatePath(
        "/anc/.t3team/worktrees/ws/.nexi/recipes/r/plan.workflow.ts",
        ".nexi",
      ),
    ).toBe("/anc/.t3team/worktrees/ws/.nexi/recipes/r/plan.workflow.ts");
    expect(
      toPhysicalProjectStatePath(
        "/anc/.t3team/worktrees/ws/.t3team/recipes/r/plan.workflow.ts",
        ".nexi",
      ),
    ).toBe("/anc/.t3team/worktrees/ws/.nexi/recipes/r/plan.workflow.ts");
  });
});

describe("two-segment state dir", () => {
  const NEW = ".agents/nexi";

  it("reads the new dir first, then the legacy one, and only writes the new one", () => {
    expect(NEXI_PROJECT_STATE_DIR).toBe(NEW);
    expect(LEGACY_NEXI_PROJECT_STATE_DIR).toBe(".nexi");
    expect(PROJECT_STATE_DIR).toBe(NEW);
    expect(projectStateReadDirNames(NEW)).toEqual([NEW, ".nexi"]);
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

  it("maps canonical paths onto the two-segment dir, idempotently", () => {
    expect(toPhysicalProjectStatePath(".t3team/recipes/x", NEW)).toBe(".agents/nexi/recipes/x");
    expect(toPhysicalProjectStatePath(".t3team", NEW)).toBe(NEW);
    expect(toPhysicalProjectStatePath("/ws/.t3team/recipes/r", NEW)).toBe(
      "/ws/.agents/nexi/recipes/r",
    );
    expect(toPhysicalProjectStatePath("C:\\ws\\.t3team\\recipes\\r", NEW)).toBe(
      "C:\\ws\\.agents\\nexi\\recipes\\r",
    );
    // Already physical, in either spelling: untouched.
    for (const physical of ["/ws/.agents/nexi/recipes/r", "/ws/.nexi/recipes/r", ".nexi/x"]) {
      expect(toPhysicalProjectStatePath(physical, NEW)).toBe(physical);
    }
    expect(toPhysicalProjectStatePath(toPhysicalProjectStatePath(".t3team/a", NEW), NEW)).toBe(
      ".agents/nexi/a",
    );
  });

  it("keeps an ancestor named .t3team out of the way of the physical state dir", () => {
    expect(
      toPhysicalProjectStatePath("/anc/.t3team/worktrees/ws/.agents/nexi/recipes/r/p.ts", NEW),
    ).toBe("/anc/.t3team/worktrees/ws/.agents/nexi/recipes/r/p.ts");
    expect(
      toPhysicalProjectStatePath("/anc/.t3team/worktrees/ws/.t3team/recipes/r/p.ts", NEW),
    ).toBe("/anc/.t3team/worktrees/ws/.agents/nexi/recipes/r/p.ts");
  });
});
