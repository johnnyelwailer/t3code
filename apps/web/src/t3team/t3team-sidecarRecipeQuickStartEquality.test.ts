import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import { areQuickStartsEqual } from "~/t3team/t3team-sidecarRecipeQuickStartEquality";
import { buildT3TeamSidecarRecipeQuickStarts } from "~/t3team/t3team-sidecarRecipes";

function createProject(profileId: string): ProjectShellProject {
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
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

describe("areQuickStartsEqual", () => {
  it("treats rebuilt quick starts with equivalent action-view context as equal", () => {
    const first = buildT3TeamSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 4,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });
    const second = buildT3TeamSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 4,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });

    expect(areQuickStartsEqual(first, second)).toBe(true);
  });

  it("detects real action-view context changes when the current view summary changes", () => {
    const first = buildT3TeamSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 4,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });
    const second = buildT3TeamSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 5,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });

    expect(areQuickStartsEqual(first, second)).toBe(false);
  });
});
