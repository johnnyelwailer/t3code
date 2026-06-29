import { describe, expect, it } from "vite-plus/test";

import {
  buildBundledSidecarRecipeKickoffMessage,
  buildBundledSidecarRecipeWorkflowLaunch,
} from "~/t3work/t3work-sidecarRecipeLaunch";

describe("buildBundledSidecarRecipeWorkflowLaunch", () => {
  it("uses local workflow files and omits inline kickoff for script-backed bundled recipes", () => {
    const workflow = buildBundledSidecarRecipeWorkflowLaunch({
      recipeId: "edit-plugin-module",
      surface: "workitem.detail.sidepanel",
      projectWorkspaceRoot: "/workspace/project-alpha",
      parameters: { targetPath: "/workspace/project-alpha/.t3work/recipes/local/recipe.json" },
    });

    expect(workflow).toMatchObject({
      recipeId: "edit-plugin-module",
      recipePath: "/workspace/project-alpha/.t3work/recipes/edit-plugin-module",
      workflowPath: "/workspace/project-alpha/.t3work/recipes/edit-plugin-module/workflow.ts",
      parameters: { targetPath: "/workspace/project-alpha/.t3work/recipes/local/recipe.json" },
    });
    expect(workflow?.kickoff).toBeUndefined();
  });

  it("returns null when a script-backed bundled recipe has no editable workspace root", () => {
    expect(
      buildBundledSidecarRecipeWorkflowLaunch({
        recipeId: "edit-plugin-module",
        surface: "workitem.detail.sidepanel",
      }),
    ).toBeNull();
  });

  it("returns null for prompt-only bundled recipes even with a workspace root", () => {
    expect(
      buildBundledSidecarRecipeWorkflowLaunch({
        recipeId: "tshirt-size-epic",
        surface: "workitem.detail.sidepanel",
        projectWorkspaceRoot: "/workspace/project-alpha",
      }),
    ).toBeNull();
  });

  it("builds a focused default kickoff message for edit-plugin-module launches", () => {
    expect(
      buildBundledSidecarRecipeKickoffMessage({
        recipeId: "edit-plugin-module",
        parameters: { targetPath: "./.t3work/recipes/local/recipe.json" },
      }),
    ).toContain("Edit ./.t3work/recipes/local/recipe.json");
  });
});
