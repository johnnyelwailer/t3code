import { describe, expect, it } from "vite-plus/test";

import {
  createT3TeamProjectSetupContentHash,
  DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
  readPersistedT3TeamProjectSetupState,
  renderT3TeamProjectSetupFiles,
  resolveT3TeamProjectSetupProfileId,
  resolveT3TeamProjectSetupWriteDecision,
  T3TEAM_PROJECT_AGENTS_PATH,
  T3TEAM_PROJECT_CLAUDE_PATH,
  T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
} from "./t3team-projectSetup.js";

describe("resolveT3TeamProjectSetupProfileId", () => {
  it("preserves unknown ids while surfacing fallback preferences", () => {
    expect(resolveT3TeamProjectSetupProfileId("unknown-profile")).toBe("unknown-profile");
  });
});

describe("renderT3TeamProjectSetupFiles", () => {
  it("renders the default setup scaffold", () => {
    const files = renderT3TeamProjectSetupFiles();
    const agents = files.find((file) => file.relativePath === T3TEAM_PROJECT_AGENTS_PATH);
    const claude = files.find((file) => file.relativePath === T3TEAM_PROJECT_CLAUDE_PATH);
    const contextReadme = files.find((file) => file.relativePath === ".t3team/context/README.md");
    const manifest = files.find(
      (file) => file.relativePath === T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
    );
    const entrypoint = files.find(
      (file) => file.relativePath === T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH,
    );
    const statusSkill = files.find(
      (file) => file.relativePath === ".t3team/skills/status-and-context-summary/SKILL.md",
    );
    const starterRecipeModule = files.find(
      (file) => file.relativePath === ".t3team/recipes/explain-selected-work/recipe.ts",
    );
    const starterRecipePrompt = files.find(
      (file) => file.relativePath === ".t3team/recipes/explain-selected-work/prompt.md",
    );
    const createRecipeModule = files.find(
      (file) => file.relativePath === ".t3team/recipes/create-recipe/recipe.ts",
    );
    const createRecipeWorkflow = files.find(
      (file) => file.relativePath === ".t3team/recipes/create-recipe/workflow.ts",
    );
    const createRecipeScript = files.find(
      (file) => file.relativePath === ".t3team/recipes/create-recipe/recipe-script.ts",
    );
    const editRecipeModule = files.find(
      (file) => file.relativePath === ".t3team/recipes/edit-plugin-module/recipe.ts",
    );
    const editRecipePrompt = files.find(
      (file) => file.relativePath === ".t3team/recipes/edit-plugin-module/prompt.md",
    );
    const editRecipeWorkflow = files.find(
      (file) => file.relativePath === ".t3team/recipes/edit-plugin-module/workflow.ts",
    );
    const editRecipeScript = files.find(
      (file) => file.relativePath === ".t3team/recipes/edit-plugin-module/recipe-script.ts",
    );
    const skillTemplate = files.find(
      (file) => file.relativePath === ".t3team/templates/skills/repeatable-workflow/SKILL.md",
    );
    const recipesAuthoringGuide = files.find(
      (file) => file.relativePath === ".t3team/recipes/AUTHORING.md",
    );

    expect(agents?.contents).toContain("Use plain, non-technical language");
    expect(agents?.contents).toContain("Do not mention cache paths, JSON file names");
    expect(agents?.contents).toContain("Keep the thread title current as the topic changes.");
    expect(agents?.contents).toContain(T3TEAM_PROJECT_CONTEXT_ENTRYPOINT_PATH);
    expect(agents?.contents).toContain("prefer a read-only subagent");
    expect(agents?.contents).toContain(
      "Save reusable work as a project recipe (under `.t3team/recipes/`) in the background",
    );
    expect(agents?.contents).toContain("do it in a separate thread scoped to the right repository");
    expect(agents?.contents).toContain("surface that thread as a link");
    expect(agents?.contents).toContain(
      "Surface the relevant findings or prior results before asking",
    );
    expect(agents?.contents).toContain("Prefer one rich context-and-actions view");
    expect(agents?.contents).toContain("give a concise evidence summary, then ask the question");
    expect(agents?.contents).not.toContain("Offer first");
    expect(agents?.contents).not.toContain("offer to save it as a project recipe");
    expect(agents?.contents).toContain("## T3Team Recipes vs Provider Features");
    expect(agents?.contents).toContain("not a Claude Code skill, slash command, or subagent");
    expect(agents?.contents).toContain("mention what you saved afterward");
    expect(agents?.managedRefresh?.knownContentHashes?.length).toBeGreaterThan(0);
    expect(claude?.contents).toBe(agents?.contents);
    expect(claude?.writeMode).toBe("if-missing");
    expect(claude?.managedRefresh?.knownContentHashes).toEqual(
      agents?.managedRefresh?.knownContentHashes,
    );
    expect(contextReadme?.contents).toContain(
      "Use this context bundle to answer project questions",
    );
    expect(contextReadme?.contents).toContain("Do not mention internal cache paths");
    expect(manifest?.writeMode).toBe("overwrite");
    expect(manifest?.contents).toContain(DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID);
    expect(manifest?.contents).toContain("defaultActionFamilies");
    expect(entrypoint?.contents).toContain("pending-sync");
    expect(statusSkill?.contents).toContain("name: t3team-status-and-context-summary");
    expect(statusSkill?.contents).toContain("Do not narrate file exploration");
    // A prompt-only starter: its default action is the prompt.md beside it.
    expect(starterRecipeModule?.contents).toContain('import { definePrompt, defineRecipe }');
    expect(starterRecipeModule?.contents).toContain('defaultAction: definePrompt("./prompt.md")');
    expect(starterRecipeModule?.contents).toContain('scope: "project"');
    expect(starterRecipePrompt?.contents).toContain("Explain this simply");
    expect(createRecipeModule?.contents).toContain(
      'defaultAction: defineWorkflow<typeof Workflow>("./workflow.ts")',
    );
    expect(createRecipeWorkflow?.contents).toContain('kind: "script"');
    expect(createRecipeWorkflow?.contents).toContain('kind: "agent"');
    expect(createRecipeScript?.contents).toContain("prepareAuthoringWorkspace");
    expect(createRecipeScript?.contents).toContain("starter/recipe.ts");
    expect(createRecipeScript?.contents).toContain("starter/example-recipe.workflow.ts");
    expect(createRecipeScript?.contents).toContain("defineRecipe");
    expect(editRecipeModule?.contents).toContain(
      'defaultAction: defineWorkflow<typeof Workflow>("./workflow.ts")',
    );
    expect(editRecipePrompt?.contents).toContain("## bundled-recipe");
    expect(editRecipePrompt?.contents).toContain("./prompts/edit-recipe.md");
    expect(editRecipeWorkflow?.contents).toContain('promptPath: "./draft-prompt.md"');
    expect(editRecipeWorkflow?.contents).toContain('actionId: "approve"');
    expect(editRecipeScript?.contents).toContain("prepareEditWorkspace");
    expect(editRecipeScript?.contents).toContain("artifacts/proposed-source.txt");
    expect(skillTemplate?.contents).toContain("use a read-only subagent");
    expect(recipesAuthoringGuide?.writeMode).toBe("if-missing");
    expect(recipesAuthoringGuide?.contents).toContain(
      "The one rule everything follows from: replay",
    );
    expect(recipesAuthoringGuide?.contents).toContain(
      "are already safe -- they're overridden to route through the journal",
    );
    expect(recipesAuthoringGuide?.contents).toContain(
      "What breaks replay is bypassing the primitives",
    );
    expect(recipesAuthoringGuide?.contents).toContain("Make the run visible");
    expect(recipesAuthoringGuide?.contents).toContain("## Patterns");
    expect(recipesAuthoringGuide?.contents).toContain(
      "orchestration doesn't need to be a saved recipe",
    );
  });

  it("includes managed file hashes in the profile manifest when provided", () => {
    const files = renderT3TeamProjectSetupFiles({
      managedFileHashes: {
        [T3TEAM_PROJECT_AGENTS_PATH]: "sha256:known",
        [T3TEAM_PROJECT_CLAUDE_PATH]: "sha256:known-claude",
      },
    });
    const manifest = files.find(
      (file) => file.relativePath === T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
    );

    expect(manifest?.contents).toContain("managedFileHashes");
    expect(manifest?.contents).toContain("sha256:known");
    expect(manifest?.contents).toContain("sha256:known-claude");
  });
});

describe("resolveT3TeamProjectSetupWriteDecision", () => {
  it("refreshes a managed file when the current contents match a known legacy hash", () => {
    const file = {
      relativePath: T3TEAM_PROJECT_AGENTS_PATH,
      contents: "new scaffold contents\n",
      writeMode: "if-missing",
      managedRefresh: {
        knownContentHashes: [createT3TeamProjectSetupContentHash("legacy scaffold contents\n")],
      },
    } as const;

    expect(
      resolveT3TeamProjectSetupWriteDecision({
        file,
        currentContents: "legacy scaffold contents\n",
      }),
    ).toEqual({
      shouldWrite: true,
      nextManagedHash: createT3TeamProjectSetupContentHash("new scaffold contents\n"),
    });
  });

  it("does not overwrite a managed file when it no longer matches the last known scaffold hash", () => {
    const file = {
      relativePath: T3TEAM_PROJECT_AGENTS_PATH,
      contents: "new scaffold contents\n",
      writeMode: "if-missing",
      managedRefresh: {
        knownContentHashes: [createT3TeamProjectSetupContentHash("legacy scaffold contents\n")],
      },
    } as const;

    expect(
      resolveT3TeamProjectSetupWriteDecision({
        file,
        currentContents: "manual user edits\n",
        persistedManagedHash: createT3TeamProjectSetupContentHash("legacy scaffold contents\n"),
      }),
    ).toEqual({
      shouldWrite: false,
    });
  });

  it("adopts the current managed hash without rewriting when the file already matches the scaffold", () => {
    const file = {
      relativePath: T3TEAM_PROJECT_AGENTS_PATH,
      contents: "current scaffold contents\n",
      writeMode: "if-missing",
      managedRefresh: {
        knownContentHashes: [createT3TeamProjectSetupContentHash("legacy scaffold contents\n")],
      },
    } as const;

    expect(
      resolveT3TeamProjectSetupWriteDecision({
        file,
        currentContents: "current scaffold contents\n",
      }),
    ).toEqual({
      shouldWrite: false,
      nextManagedHash: createT3TeamProjectSetupContentHash("current scaffold contents\n"),
    });
  });
});

describe("readPersistedT3TeamProjectSetupState", () => {
  it("reads the stored profile id and managed file hashes", () => {
    expect(
      readPersistedT3TeamProjectSetupState(
        '{"profileId":"developer","managedFileHashes":{"AGENTS.md":"sha256:known","CLAUDE.md":"sha256:known-claude"}}',
      ),
    ).toEqual({
      profileId: "developer",
      managedFileHashes: {
        "AGENTS.md": "sha256:known",
        "CLAUDE.md": "sha256:known-claude",
      },
    });
  });
});
