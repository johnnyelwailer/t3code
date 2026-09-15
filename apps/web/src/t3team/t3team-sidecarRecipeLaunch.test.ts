import { describe, expect, it } from "vite-plus/test";

import {
  buildBundledSidecarRecipeKickoffMessage,
  buildBundledSidecarRecipeWorkflowLaunch,
} from "~/t3team/t3team-sidecarRecipeLaunch";

describe("buildBundledSidecarRecipeWorkflowLaunch", () => {
  it("uses local workflow files and omits inline kickoff for workflow-backed bundled recipes", () => {
    const workflow = buildBundledSidecarRecipeWorkflowLaunch({
      recipeId: "describe-rewrite",
      surface: "workitem.detail.sidepanel",
      projectWorkspaceRoot: "/workspace/project-alpha",
    });

    expect(workflow).toMatchObject({
      recipeId: "describe-rewrite",
      recipePath: "/workspace/project-alpha/.t3team/recipes/describe-rewrite",
      workflowPath: "/workspace/project-alpha/.t3team/recipes/describe-rewrite/workflow.ts",
    });
    expect(workflow?.kickoff).toBeUndefined();
  });

  it("returns null when a workflow-backed bundled recipe has no editable workspace root", () => {
    expect(
      buildBundledSidecarRecipeWorkflowLaunch({
        recipeId: "describe-rewrite",
        surface: "workitem.detail.sidepanel",
      }),
    ).toBeNull();
  });

  it("returns null for prompt-only bundled recipes even with a workspace root", () => {
    expect(
      buildBundledSidecarRecipeWorkflowLaunch({
        recipeId: "manage-project-recipes",
        surface: "workitem.detail.sidepanel",
        projectWorkspaceRoot: "/workspace/project-alpha",
      }),
    ).toBeNull();
  });

  it("builds a focused default kickoff message for manage-project-recipes edits", () => {
    expect(
      buildBundledSidecarRecipeKickoffMessage({
        recipeId: "manage-project-recipes",
        parameters: { targetPath: "./.t3team/recipes/local/recipe.json" },
      }),
    ).toContain("Edit the recipe or plugin module at ./.t3team/recipes/local/recipe.json");
  });
});
