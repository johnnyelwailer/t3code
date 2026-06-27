import { describe, expect, it } from "vite-plus/test";

import {
  createT3WorkProjectSetupContentHash,
  DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
  readPersistedT3WorkProjectSetupState,
  renderT3WorkProjectSetupFiles,
  resolveT3WorkProjectSetupProfileId,
  resolveT3WorkProjectSetupWriteDecision,
  T3WORK_PROJECT_AGENTS_PATH,
  T3WORK_PROJECT_CLAUDE_PATH,
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
} from "./t3work-projectSetup.js";

describe("resolveT3WorkProjectSetupProfileId", () => {
  it("preserves unknown ids while surfacing fallback preferences", () => {
    expect(resolveT3WorkProjectSetupProfileId("unknown-profile")).toBe("unknown-profile");
  });
});

describe("renderT3WorkProjectSetupFiles", () => {
  it("renders the default setup scaffold", () => {
    const files = renderT3WorkProjectSetupFiles();
    const agents = files.find((file) => file.relativePath === T3WORK_PROJECT_AGENTS_PATH);
    const claude = files.find((file) => file.relativePath === T3WORK_PROJECT_CLAUDE_PATH);
    const contextReadme = files.find((file) => file.relativePath === ".t3work/context/README.md");
    const manifest = files.find(
      (file) => file.relativePath === T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
    );
    const entrypoint = files.find(
      (file) => file.relativePath === T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
    );
    const statusSkill = files.find(
      (file) => file.relativePath === ".t3work/skills/status-and-context-summary/SKILL.md",
    );
    const starterRecipeManifest = files.find(
      (file) => file.relativePath === ".t3work/recipes/explain-selected-work/recipe.json",
    );
    const starterRecipePrompt = files.find(
      (file) => file.relativePath === ".t3work/recipes/explain-selected-work/prompt.md",
    );
    const createRecipeManifest = files.find(
      (file) => file.relativePath === ".t3work/recipes/create-recipe/recipe.json",
    );
    const createRecipeWorkflow = files.find(
      (file) => file.relativePath === ".t3work/recipes/create-recipe/workflow.ts",
    );
    const createRecipeScript = files.find(
      (file) => file.relativePath === ".t3work/recipes/create-recipe/recipe-script.ts",
    );
    const editRecipeManifest = files.find(
      (file) => file.relativePath === ".t3work/recipes/edit-plugin-module/recipe.json",
    );
    const editRecipePrompt = files.find(
      (file) => file.relativePath === ".t3work/recipes/edit-plugin-module/prompt.md",
    );
    const editRecipeWorkflow = files.find(
      (file) => file.relativePath === ".t3work/recipes/edit-plugin-module/workflow.ts",
    );
    const editRecipeScript = files.find(
      (file) => file.relativePath === ".t3work/recipes/edit-plugin-module/recipe-script.ts",
    );
    const skillTemplate = files.find(
      (file) => file.relativePath === ".t3work/templates/skills/repeatable-workflow/SKILL.md",
    );

    expect(agents?.contents).toContain("Use plain, non-technical language");
    expect(agents?.contents).toContain("Do not mention cache paths, JSON file names");
    expect(agents?.contents).toContain("Keep the thread title current as the topic changes.");
    expect(agents?.contents).toContain(T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH);
    expect(agents?.contents).toContain("prefer a read-only subagent");
    expect(agents?.contents).toContain("offer to save it as a one-click play");
    expect(agents?.contents).toContain("do it in a separate thread scoped to the right repository");
    expect(agents?.contents).toContain("surface that thread as a link");
    expect(agents?.contents).toContain("Offer first");
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
    expect(manifest?.contents).toContain(DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID);
    expect(manifest?.contents).toContain("defaultActionFamilies");
    expect(entrypoint?.contents).toContain("pending-sync");
    expect(statusSkill?.contents).toContain("name: t3work-status-and-context-summary");
    expect(statusSkill?.contents).toContain("Do not narrate file exploration");
    expect(starterRecipeManifest?.contents).toContain('"scope": "project"');
    expect(starterRecipePrompt?.contents).toContain("Explain this simply");
    expect(createRecipeManifest?.contents).toContain('"workflow": "./workflow.ts"');
    expect(createRecipeWorkflow?.contents).toContain('kind: "script"');
    expect(createRecipeWorkflow?.contents).toContain('kind: "agent"');
    expect(createRecipeScript?.contents).toContain("prepareAuthoringWorkspace");
    expect(createRecipeScript?.contents).toContain("starter/recipe.ts");
    expect(createRecipeScript?.contents).toContain("starter/example-recipe.workflow.ts");
    expect(createRecipeScript?.contents).toContain("defineRecipe");
    expect(editRecipeManifest?.contents).toContain('"workflow": "./workflow.ts"');
    expect(editRecipePrompt?.contents).toContain("## bundled-recipe");
    expect(editRecipePrompt?.contents).toContain("./prompts/edit-recipe.md");
    expect(editRecipeWorkflow?.contents).toContain('promptPath: "./draft-prompt.md"');
    expect(editRecipeWorkflow?.contents).toContain('actionId: "approve"');
    expect(editRecipeScript?.contents).toContain("prepareEditWorkspace");
    expect(editRecipeScript?.contents).toContain("artifacts/proposed-source.txt");
    expect(skillTemplate?.contents).toContain("use a read-only subagent");
  });

  it("includes managed file hashes in the profile manifest when provided", () => {
    const files = renderT3WorkProjectSetupFiles({
      managedFileHashes: {
        [T3WORK_PROJECT_AGENTS_PATH]: "sha256:known",
        [T3WORK_PROJECT_CLAUDE_PATH]: "sha256:known-claude",
      },
    });
    const manifest = files.find(
      (file) => file.relativePath === T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
    );

    expect(manifest?.contents).toContain("managedFileHashes");
    expect(manifest?.contents).toContain("sha256:known");
    expect(manifest?.contents).toContain("sha256:known-claude");
  });
});

describe("resolveT3WorkProjectSetupWriteDecision", () => {
  it("refreshes a managed file when the current contents match a known legacy hash", () => {
    const file = {
      relativePath: T3WORK_PROJECT_AGENTS_PATH,
      contents: "new scaffold contents\n",
      writeMode: "if-missing",
      managedRefresh: {
        knownContentHashes: [createT3WorkProjectSetupContentHash("legacy scaffold contents\n")],
      },
    } as const;

    expect(
      resolveT3WorkProjectSetupWriteDecision({
        file,
        currentContents: "legacy scaffold contents\n",
      }),
    ).toEqual({
      shouldWrite: true,
      nextManagedHash: createT3WorkProjectSetupContentHash("new scaffold contents\n"),
    });
  });

  it("does not overwrite a managed file when it no longer matches the last known scaffold hash", () => {
    const file = {
      relativePath: T3WORK_PROJECT_AGENTS_PATH,
      contents: "new scaffold contents\n",
      writeMode: "if-missing",
      managedRefresh: {
        knownContentHashes: [createT3WorkProjectSetupContentHash("legacy scaffold contents\n")],
      },
    } as const;

    expect(
      resolveT3WorkProjectSetupWriteDecision({
        file,
        currentContents: "manual user edits\n",
        persistedManagedHash: createT3WorkProjectSetupContentHash("legacy scaffold contents\n"),
      }),
    ).toEqual({
      shouldWrite: false,
    });
  });

  it("adopts the current managed hash without rewriting when the file already matches the scaffold", () => {
    const file = {
      relativePath: T3WORK_PROJECT_AGENTS_PATH,
      contents: "current scaffold contents\n",
      writeMode: "if-missing",
      managedRefresh: {
        knownContentHashes: [createT3WorkProjectSetupContentHash("legacy scaffold contents\n")],
      },
    } as const;

    expect(
      resolveT3WorkProjectSetupWriteDecision({
        file,
        currentContents: "current scaffold contents\n",
      }),
    ).toEqual({
      shouldWrite: false,
      nextManagedHash: createT3WorkProjectSetupContentHash("current scaffold contents\n"),
    });
  });
});

describe("readPersistedT3WorkProjectSetupState", () => {
  it("reads the stored profile id and managed file hashes", () => {
    expect(
      readPersistedT3WorkProjectSetupState(
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
