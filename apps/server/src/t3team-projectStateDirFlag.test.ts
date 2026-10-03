import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { NEXI_STATE_DIR_FLAG_ENV } from "@t3tools/project-context/t3teamProjectStateDir";

// The state dir name is fixed per process at module load, so each case re-imports the modules
// with the flag set the way a pack build's server process would see it.
describe("NEXI_FF_NEXI_STATE_DIR", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("moves every server-owned state path into .nexi when on", async () => {
    vi.stubEnv(NEXI_STATE_DIR_FLAG_ENV, "1");
    vi.resetModules();
    const utils = await import("./t3team-project-repository-utils.ts");
    const setup = await import("./t3team-projectSetupShared.ts");
    const blobs = await import("./t3team-context-blob-store-utils.ts");
    expect(utils.HIDDEN_T3TEAM_DIR).toBe(".nexi");
    expect(utils.GITIGNORE_ENTRY).toBe(".nexi/");
    expect(utils.MAIN_REPOSITORY_GITIGNORE_ENTRIES).toEqual([
      ".nexi/references/",
      ".nexi/child-session-worktrees/",
    ]);
    expect(setup.T3TEAM_PROJECT_RECIPES_ROOT).toBe(".nexi/recipes");
    expect(setup.T3TEAM_PROJECT_CONTEXT_ROOT).toBe(".nexi/context");
    expect(setup.T3TEAM_PROJECT_PROFILE_MANIFEST_PATH).toBe(".nexi/setup/profile.json");
    expect(blobs.T3TEAM_CONTEXT_BLOB_ROOT).toBe(".nexi/context/_blobs");
  });

  it("advertises the startup selection after the environment changes", async () => {
    vi.stubEnv(NEXI_STATE_DIR_FLAG_ENV, "1");
    vi.resetModules();
    const state = await import("@t3tools/project-context/t3teamProjectStateDir");
    vi.stubEnv(NEXI_STATE_DIR_FLAG_ENV, "0");
    expect(state.isNexiStateDirEnabled()).toBe(false);
    expect(state.PROJECT_STATE_DIR).toBe(".nexi");
    expect(state.isNexiStateDirSelectedAtStartup()).toBe(true);
  });

  it("keeps .t3team when off", async () => {
    vi.stubEnv(NEXI_STATE_DIR_FLAG_ENV, "");
    vi.resetModules();
    const utils = await import("./t3team-project-repository-utils.ts");
    const setup = await import("./t3team-projectSetupShared.ts");
    expect(utils.HIDDEN_T3TEAM_DIR).toBe(".t3team");
    expect(setup.T3TEAM_PROJECT_RECIPES_ROOT).toBe(".t3team/recipes");
  });
});
