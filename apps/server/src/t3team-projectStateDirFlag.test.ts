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

  it("names the physical dir in agent-visible text and keeps legacy hashes canonical", async () => {
    vi.stubEnv(NEXI_STATE_DIR_FLAG_ENV, "1");
    vi.resetModules();
    const skill = await import("./t3team-projectSetupStatusSkill.ts");
    const content = await import("./t3team-projectSetupContent.ts");
    const legacy = await import("./t3team-projectSetupAgentsManagedRefresh.ts");
    const rewrite = await import("./t3team-projectSetupDescriptionRewriteRecipe.ts");
    const packs = await import("@t3tools/t3team-skill-packs");
    const catalog = await import("@t3tools/project-context/t3teamToolCatalog");
    const profile = packs.listT3TeamProfiles()[0];
    if (profile === undefined) throw new Error("expected a bundled profile");

    const status = skill.renderStatusAndContextSkill();
    expect(status).toContain(".nexi/context/");
    expect(status).not.toContain(".t3team/");

    const agents = content.renderAgentsMd(profile);
    expect(agents).toContain(".nexi/references/reference-repositories.json");
    expect(agents).not.toContain(".t3team/");

    const manage = packs
      .listBundledT3TeamRecipes()
      .find((recipe) => recipe.id === "manage-project-recipes");
    expect(manage?.promptTemplate).toContain(".nexi/recipes/<recipe-id>/");
    expect(manage?.promptTemplate).not.toContain(".t3team/");

    const tools = catalog.listImplementedT3TeamToolCatalogEntries();
    const list = tools.find((tool) => tool.id === "t3team.recipe.list");
    const run = tools.find((tool) => tool.id === "t3team.orchestration.run");
    expect(list?.description).toContain(".nexi/recipes/");
    expect(list?.description).not.toContain(".t3team/");
    expect(run?.description).toContain(".nexi/recipes/AUTHORING.md");
    expect(run?.description).toContain(".t3team-runs/");
    expect(run?.description).not.toContain(".t3team/recipes");

    const workflow = rewrite.renderDescriptionRewriteWorkflow();
    expect(workflow).toContain(".nexi/context/work-items/");
    expect(workflow).not.toContain(".t3team/context/");

    expect(legacy.renderLegacyAgentsMd(profile)).toContain(
      ".t3team/references/reference-repositories.json",
    );
    expect(legacy.renderPreviousAgentsMd(profile)).toContain(".t3team/recipes/");
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
