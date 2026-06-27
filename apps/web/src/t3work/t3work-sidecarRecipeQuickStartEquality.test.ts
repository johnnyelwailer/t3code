import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import { areQuickStartsEqual } from "~/t3work/t3work-sidecarRecipeQuickStartEquality";
import { buildT3workSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipes";

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
    const first = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-owner"),
      profileId: "product-owner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 4,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });
    const second = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-owner"),
      profileId: "product-owner",
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
    const first = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-owner"),
      profileId: "product-owner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 4,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });
    const second = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-owner"),
      profileId: "product-owner",
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
