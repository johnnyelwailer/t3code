/**
 * A minimal render context for recipe-discovery tests (Epic 16 §Discovery and Pre-Launch
 * Rendering). Shared by the multi-action and ctx-derived-metadata tests so both exercise the same
 * shape the dashboard actually passes.
 */
import { createQueryable } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";

export function backlogRenderContext(
  overrides: Partial<ProjectRecipeRenderContext> = {},
): ProjectRecipeRenderContext {
  return {
    surface: "project.dashboard.backlog",
    project: { title: "Project Alpha", provider: "jira" },
    workitem: {
      kind: "ticket",
      displayId: "ALPHA-42",
      type: "Bug",
      priority: "High",
      provider: "jira",
    },
    linkedResources: createQueryable([]),
    artifacts: createQueryable([]),
    profile: {
      technicalDepth: "medium",
      brevity: "balanced",
      guidanceStyle: "guided",
      detailDensity: "balanced",
      preferredArtifactKinds: [],
      defaultActionFamilies: [],
      defaultRecipeWeights: {},
    },
    enabledSkillPacks: [],
    schema: {},
    availableContextKeys: createQueryable([]),
    ...overrides,
  } as ProjectRecipeRenderContext;
}
