import { describe, expect, it } from "vite-plus/test";

import {
  decideMachineFileMigration,
  isNexiStateDirEnabled,
  LEGACY_NEXI_PROJECT_STATE_DIR,
  NEXI_PROJECT_STATE_DIR,
  NEXI_STATE_DIR_FLAG_ENV,
  PROJECT_MACHINE_FILE_PATH,
  PROJECT_STATE_DIR,
  projectMachineCheckedLocations,
  projectMachineFilePath,
  projectMachineFilePathLookupOrder,
  projectStateDirLookupOrder,
  resolveProjectStateDirName,
  toPhysicalProjectStatePath,
} from "./t3team-projectStateDir.ts";
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
    expect(NEXI_PROJECT_STATE_DIR).toBe(".agents/nexi");
    expect(LEGACY_NEXI_PROJECT_STATE_DIR).toBe(".nexi");
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

  it("lists lookup directories preferred-first, without duplicates", () => {
    expect(projectStateDirLookupOrder(".agents/nexi")).toEqual([
      ".agents/nexi",
      ".nexi",
      ".t3team",
    ]);
    expect(projectStateDirLookupOrder(".nexi")).toEqual([".nexi", ".agents/nexi", ".t3team"]);
    expect(projectStateDirLookupOrder(".t3team")).toEqual([".t3team", ".agents/nexi", ".nexi"]);
  });

  it("maps canonical and legacy client paths onto the physical dir, idempotently", () => {
    expect(toPhysicalProjectStatePath(".t3team/context/entrypoint.json", ".agents/nexi")).toBe(
      ".agents/nexi/context/entrypoint.json",
    );
    expect(toPhysicalProjectStatePath(".nexi/context/entrypoint.json", ".agents/nexi")).toBe(
      ".agents/nexi/context/entrypoint.json",
    );
    expect(toPhysicalProjectStatePath("./.t3team/recipes/a/recipe.ts", ".agents/nexi")).toBe(
      ".agents/nexi/recipes/a/recipe.ts",
    );
    expect(toPhysicalProjectStatePath(".t3team", ".agents/nexi")).toBe(".agents/nexi");
    expect(toPhysicalProjectStatePath(".nexi", ".agents/nexi")).toBe(".agents/nexi");
    expect(toPhysicalProjectStatePath(".agents/nexi/context/x.json", ".agents/nexi")).toBe(
      ".agents/nexi/context/x.json",
    );
    // Neighbours that merely share the prefix are not the state dir.
    expect(toPhysicalProjectStatePath(".t3team-runs/run.json", ".agents/nexi")).toBe(
      ".t3team-runs/run.json",
    );
    expect(toPhysicalProjectStatePath("AGENTS.md", ".agents/nexi")).toBe("AGENTS.md");
    expect(toPhysicalProjectStatePath(".t3team/context/x.json", ".t3team")).toBe(
      ".t3team/context/x.json",
    );
    // An explicit older physical target still maps .t3team onto .nexi.
    expect(toPhysicalProjectStatePath(".t3team/context/entrypoint.json", ".nexi")).toBe(
      ".nexi/context/entrypoint.json",
    );
    expect(toPhysicalProjectStatePath(".nexi/context/x.json", ".nexi")).toBe(
      ".nexi/context/x.json",
    );
  });

  it("maps absolute paths a client builds under the workspace root", () => {
    expect(
      toPhysicalProjectStatePath("/ws/app/.t3team/recipes/r/workflow.ts", ".agents/nexi"),
    ).toBe("/ws/app/.agents/nexi/recipes/r/workflow.ts");
    expect(toPhysicalProjectStatePath("/ws/app/.nexi/recipes/r/workflow.ts", ".agents/nexi")).toBe(
      "/ws/app/.agents/nexi/recipes/r/workflow.ts",
    );
    expect(toPhysicalProjectStatePath("C:\\ws\\.t3team\\recipes\\r", ".agents/nexi")).toBe(
      "C:\\ws\\.agents\\nexi\\recipes\\r",
    );
    expect(toPhysicalProjectStatePath("C:\\ws\\.nexi\\recipes\\r", ".agents/nexi")).toBe(
      "C:\\ws\\.agents\\nexi\\recipes\\r",
    );
    expect(toPhysicalProjectStatePath("/ws/.t3team-runs/r/workflow.ts", ".agents/nexi")).toBe(
      "/ws/.t3team-runs/r/workflow.ts",
    );
    expect(toPhysicalProjectStatePath("/ws/my.t3team/x", ".agents/nexi")).toBe("/ws/my.t3team/x");
    // An unrelated ANCESTOR directory named .t3team (e.g. this app's own child-worktree roots)
    // is not the state dir: already-physical paths pass through, and the state-dir segment wins
    // over an ancestor of the same name.
    expect(
      toPhysicalProjectStatePath(
        "/anc/.t3team/worktrees/ws/.agents/nexi/recipes/r/plan.workflow.ts",
        ".agents/nexi",
      ),
    ).toBe("/anc/.t3team/worktrees/ws/.agents/nexi/recipes/r/plan.workflow.ts");
    expect(
      toPhysicalProjectStatePath(
        "/anc/.t3team/worktrees/ws/.nexi/recipes/r/plan.workflow.ts",
        ".agents/nexi",
      ),
    ).toBe("/anc/.t3team/worktrees/ws/.agents/nexi/recipes/r/plan.workflow.ts");
    expect(
      toPhysicalProjectStatePath(
        "/anc/.t3team/worktrees/ws/.t3team/recipes/r/plan.workflow.ts",
        ".agents/nexi",
      ),
    ).toBe("/anc/.t3team/worktrees/ws/.agents/nexi/recipes/r/plan.workflow.ts");
  });

  it("derives the machine pointer from the state dir and looks up older paths after it", () => {
    expect(projectMachineFilePath(".agents/nexi")).toBe(".agents/nexi/machine.json");
    expect(projectMachineFilePath(".nexi")).toBe(".nexi/machine.json");
    expect(projectMachineFilePath(".t3team")).toBe(".t3team/machine.json");
    expect(projectMachineFilePath()).toBe(PROJECT_MACHINE_FILE_PATH);
    expect(PROJECT_MACHINE_FILE_PATH).toBe(`${PROJECT_STATE_DIR}/machine.json`);
    expect(projectMachineFilePathLookupOrder(".agents/nexi")).toEqual([
      ".agents/nexi/machine.json",
      ".nexi/machine.json",
      ".t3team/machine.json",
    ]);
    expect(projectMachineFilePathLookupOrder(".t3team")).toEqual([
      ".t3team/machine.json",
      ".agents/nexi/machine.json",
      ".nexi/machine.json",
    ]);
    expect(projectMachineCheckedLocations(".agents/nexi")).toBe(
      ".agents/nexi/machine.json, .nexi/machine.json, .t3team/machine.json, .devcontainer/devcontainer.json and .devcontainer.json",
    );
  });

  it("copies a missing machine pointer once and leaves an existing target alone", () => {
    const targetPath = ".agents/nexi/machine.json";
    const sources = [
      { path: ".nexi/machine.json", exists: true },
      { path: ".t3team/machine.json", exists: true },
    ];
    expect(decideMachineFileMigration({ targetPath, targetExists: false, sources: [] })).toEqual({
      action: "noop",
    });
    expect(
      decideMachineFileMigration({
        targetPath,
        targetExists: false,
        sources: [
          { path: ".nexi/machine.json", exists: false },
          { path: ".t3team/machine.json", exists: false },
        ],
      }),
    ).toEqual({ action: "noop" });
    expect(decideMachineFileMigration({ targetPath, targetExists: false, sources })).toEqual({
      action: "copy",
      source: ".nexi/machine.json",
    });
    expect(
      decideMachineFileMigration({
        targetPath,
        targetExists: false,
        sources: [
          { path: ".nexi/machine.json", exists: false },
          { path: ".t3team/machine.json", exists: true },
        ],
      }),
    ).toEqual({ action: "copy", source: ".t3team/machine.json" });
    expect(decideMachineFileMigration({ targetPath, targetExists: true, sources })).toEqual({
      action: "noop",
    });
    expect(decideMachineFileMigration({ targetPath, targetExists: true, sources })).toEqual({
      action: "noop",
    });
  });
});
