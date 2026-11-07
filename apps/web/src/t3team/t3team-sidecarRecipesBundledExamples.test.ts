import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import { buildT3TeamSidecarRecipeQuickStarts } from "~/t3team/t3team-sidecarRecipes";
import type { T3TeamSidecarRecipeInput } from "~/t3team/t3team-sidecarRecipeTypes";

const project: ProjectShellProject = {
  id: "project-alpha" as ProjectShellProject["id"],
  title: "Project Alpha",
  source: {
    provider: "atlassian",
    externalProjectId: "PA",
    raw: { agentSetup: { profileId: "engineering-copilot" } },
  },
  workspace: { rootPath: "/tmp/project-alpha", createdAt: "2026-05-01T00:00:00.000Z" },
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

const ticketInput: T3TeamSidecarRecipeInput = {
  surface: "workitem.detail.sidepanel",
  project,
  profileId: "engineering-copilot",
  selectedWorkLabel: "PROJ-1",
  resourceKind: "ticket",
  jiraIssueType: "Task",
  availableContextKeys: ["project.summary", "ticket.summary"],
  limit: 50,
};
const dashboardInput: T3TeamSidecarRecipeInput = {
  surface: "project.dashboard",
  project,
  profileId: "engineering-copilot",
  selectedWorkLabel: project.title,
  dashboardMode: "backlog",
  currentViewSummary: { itemCount: 4, bugCount: 1, primaryBugLabel: "IES-1" },
  availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
  limit: 50,
};
// The digest catalog resolves its recipes per this surface, with a 50-recipe limit.
const digestInput: T3TeamSidecarRecipeInput = {
  surface: "github.pull_request.detail.sidepanel",
  project,
  profileId: "engineering-copilot",
  selectedWorkLabel: project.title,
  availableContextKeys: ["project.summary"],
  limit: 50,
};

const ids = (input: T3TeamSidecarRecipeInput, examples?: boolean) =>
  buildT3TeamSidecarRecipeQuickStarts(input, examples).map((quickStart) => quickStart.id);

describe("bundled recipe examples behind BUNDLED_RECIPE_EXAMPLES", () => {
  it("offers only the recipe-authoring entry by default", () => {
    expect(ids(ticketInput)).toEqual(["manage-project-recipes"]);
    expect(ids(dashboardInput)).toEqual([]);
    expect(ids(digestInput)).toEqual([]);
  });

  it("offers the examples again when the flag is on", () => {
    expect(ids(ticketInput, true)).toEqual(expect.arrayContaining(["explain-selected-work"]));
    expect(ids(ticketInput, true).length).toBeGreaterThan(1);
    expect(ids(dashboardInput, true).length).toBeGreaterThan(0);
  });
});
