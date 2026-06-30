import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import { resolveT3workKickoffSectionProps } from "~/t3work/t3work-sidecarKickoffSectionProps";

function createRecipeInput() {
  const project: ProjectShellProject = {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      externalProjectId: "PA",
      raw: { agentSetup: { profileId: "delivery-coordinator" } },
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };

  return {
    backend: null,
    surface: "project.dashboard" as const,
    project,
    profileId: "delivery-coordinator",
    selectedWorkLabel: "Project Alpha",
    availableContextKeys: ["project.summary"],
  };
}

describe("resolveT3workKickoffSectionProps", () => {
  it("maps legacy quick-starts section id to quick-actions topic", () => {
    expect(
      resolveT3workKickoffSectionProps({
        sectionId: "quick-starts",
        recipeInput: createRecipeInput(),
      }),
    ).toMatchObject({
      topic: "quick-actions",
      recipeInput: createRecipeInput(),
    });
  });

  it("maps legacy recent-conversations section id to recent threads props", () => {
    expect(
      resolveT3workKickoffSectionProps({
        sectionId: "recent-conversations",
        recipeInput: createRecipeInput(),
        recentThreads: [],
        recentEmptyMessage: "No recent threads",
      }),
    ).toEqual({
      threads: [],
      emptyMessage: "No recent threads",
    });
  });

  it("maps bundled filters section to inline-filters topic", () => {
    expect(
      resolveT3workKickoffSectionProps({
        sectionId: "filters",
        recipeInput: createRecipeInput(),
      }),
    ).toMatchObject({
      topic: "filters",
    });
  });
});
