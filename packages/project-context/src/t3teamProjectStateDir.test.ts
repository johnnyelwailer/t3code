import { describe, expect, it } from "vite-plus/test";

import {
  isNexiStateDirEnabled,
  NEXI_STATE_DIR_FLAG_ENV,
  PROJECT_STATE_DIR,
  resolveProjectStateDirName,
  toPhysicalProjectStatePath,
} from "./t3teamProjectStateDir.ts";
import { T3TEAM_PROJECT_CONTEXT_ROOT } from "./t3teamContextPaths.ts";

const env =
  (value: string | undefined) =>
  (key: string): string | undefined =>
    key === NEXI_STATE_DIR_FLAG_ENV ? value : undefined;

describe("project state dir resolver", () => {
  it("keeps .t3team by default and for any value that is not an explicit on", () => {
    for (const value of [undefined, "", "0", "false", "off", "yes"]) {
      expect(isNexiStateDirEnabled(env(value))).toBe(false);
      expect(resolveProjectStateDirName(env(value))).toBe(".t3team");
    }
  });

  it("names the state dir .nexi when NEXI_FF_NEXI_STATE_DIR is on", () => {
    for (const value of ["1", "true", "ON", " on "]) {
      expect(resolveProjectStateDirName(env(value))).toBe(".nexi");
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
  });
});
