import { describe, expect, it } from "vitest";
import type { ProjectShellProject } from "@t3tools/project-context";

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

describe("focus-needs-my-action recipe", () => {
  it("surfaces on broad dashboard views that need narrowing", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 100,
        bugCount: 12,
        primaryBugLabel: "IES-18659",
        needsMyActionPreset: "unassigned",
        needsMyActionCount: 9,
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });

    expect(quickStarts.find((recipe) => recipe.id === "focus-needs-my-action")).toMatchObject({
      title: "Show what needs my action",
      description:
        "Filter the current view to the work most likely waiting on you, then rank the next move.",
    });
  });

  it("stays hidden on already focused slices", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "my-work",
      currentViewSummary: {
        itemCount: 8,
        bugCount: 1,
        primaryBugLabel: "IES-1200",
      },
      availableContextKeys: ["project.summary", "dashboard.my-work.summary"],
    });

    expect(quickStarts.some((recipe) => recipe.id === "focus-needs-my-action")).toBe(false);
  });

  it("stays hidden on broad views when no deterministic narrowing exists", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 80,
        bugCount: 4,
        primaryBugLabel: "IES-1202",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });

    expect(quickStarts.some((recipe) => recipe.id === "focus-needs-my-action")).toBe(false);
  });
});
