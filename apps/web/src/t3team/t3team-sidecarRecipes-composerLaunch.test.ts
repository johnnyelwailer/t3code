import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import { buildT3TeamSidecarRecipeQuickStarts } from "~/t3team/t3team-sidecarRecipes";

function createProject(profileId: string, workspaceRoot?: string): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      externalProjectId: "PA",
      raw: {
        agentSetup: {
          profileId,
        },
      },
    },
    ...(workspaceRoot
      ? {
          workspace: {
            rootPath: workspaceRoot,
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        }
      : {}),
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

/** What a composer can launch: which recipes it is offered and the workflow paths it starts. */
describe("buildT3TeamSidecarRecipeQuickStarts for composer launches", () => {
  it("offers no bundled recipe to the in-thread composer until one declares thread.context", () => {
    const quickStarts = buildT3TeamSidecarRecipeQuickStarts({
      surface: "thread.context",
      project: createProject("engineering-copilot", "/workspace/alpha"),
      profileId: "engineering-copilot",
      selectedWorkLabel: "Project Alpha",
    });

    expect(quickStarts).toEqual([]);
  });

  it("includes local recipePath and workflowPath for the bundled describe-rewrite example", () => {
    const quickStarts = buildT3TeamSidecarRecipeQuickStarts(
      {
        surface: "workitem.detail.sidepanel",
        project: createProject("engineering-copilot", "/tmp/project-alpha"),
        profileId: "engineering-copilot",
        selectedWorkLabel: "PROJ-123",
        selectedWorkTitle: "Stabilize search",
        resourceKind: "ticket",
        jiraIssueType: "Bug",
        availableContextKeys: ["project.summary", "ticket.summary"],
      },
      true,
    );

    expect(quickStarts.find((recipe) => recipe.id === "describe-rewrite")).toMatchObject({
      workflow: {
        recipeId: "describe-rewrite",
        recipePath: "/tmp/project-alpha/.t3team/recipes/describe-rewrite",
        workflowPath: "/tmp/project-alpha/.t3team/recipes/describe-rewrite/workflow.ts",
      },
    });
  });

  it("does not attach workflow launch metadata to prompt-only bundled examples", () => {
    const quickStarts = buildT3TeamSidecarRecipeQuickStarts(
      {
        surface: "workitem.detail.sidepanel",
        project: createProject("product-partner", "/tmp/project-alpha"),
        profileId: "product-partner",
        selectedWorkLabel: "PROJ-100",
        selectedWorkTitle: "Platform epic",
        resourceKind: "ticket",
        jiraIssueType: "Epic",
        ticketContext: {
          relationships: {
            childKeys: [],
            referenceKeys: [],
            blockedByKeys: [],
            blockingKeys: [],
          },
        },
        availableContextKeys: ["project.summary", "ticket.summary"],
      },
      true,
    );

    const recipe = quickStarts.find((quickStart) => quickStart.id === "tshirt-size-epic");
    expect(recipe).toBeDefined();
    expect(recipe?.workflow).toBeUndefined();
  });
});
