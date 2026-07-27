import { describe, expect, it } from "vite-plus/test";

import { resolveT3TeamSetupSurfaceReason } from "~/t3team/t3team-setupSurfaceReason";

const localProject = { id: "local-1", title: "My Local Repo", source: { provider: "local" } } as const;
const secondLocalProject = {
  id: "local-2",
  title: "Another Repo",
  source: { provider: "local" },
} as const;

describe("resolveT3TeamSetupSurfaceReason", () => {
  it("reports first-project when reopenInitialSetup is true, even with existing projects", () => {
    expect(
      resolveT3TeamSetupSurfaceReason({
        allProjects: [localProject],
        selectedProjectId: localProject.id,
        reopenInitialSetup: true,
      }),
    ).toEqual({ kind: "first-project" });
  });

  it("reports first-project when there are zero projects", () => {
    expect(
      resolveT3TeamSetupSurfaceReason({
        allProjects: [],
        selectedProjectId: null,
        reopenInitialSetup: false,
      }),
    ).toEqual({ kind: "first-project" });
  });

  it("reports no-work-project with the selected project's title when it matches by id", () => {
    expect(
      resolveT3TeamSetupSurfaceReason({
        allProjects: [localProject, secondLocalProject],
        selectedProjectId: secondLocalProject.id,
        reopenInitialSetup: false,
      }),
    ).toEqual({ kind: "no-work-project", projectTitle: secondLocalProject.title });
  });

  it("falls back to the sole project's title when selectedProjectId is null", () => {
    expect(
      resolveT3TeamSetupSurfaceReason({
        allProjects: [localProject],
        selectedProjectId: null,
        reopenInitialSetup: false,
      }),
    ).toEqual({ kind: "no-work-project", projectTitle: localProject.title });
  });

  it("falls back to the sole project's title when selectedProjectId matches nothing", () => {
    expect(
      resolveT3TeamSetupSurfaceReason({
        allProjects: [localProject],
        selectedProjectId: "missing-id",
        reopenInitialSetup: false,
      }),
    ).toEqual({ kind: "no-work-project", projectTitle: localProject.title });
  });

  it("does not claim 'no work source' when a work project exists", () => {
    // Regression: the home surface is also reached with a work project around
    // (e.g. a route naming a project id the shell does not know). Claiming that
    // project is an unconnected local workspace would be a lie.
    const jiraProject = {
      id: "jira-1",
      title: "Interne Tasks",
      source: { provider: "atlassian" },
    } as const;
    expect(
      resolveT3TeamSetupSurfaceReason({
        allProjects: [localProject, jiraProject],
        selectedProjectId: jiraProject.id,
        reopenInitialSetup: false,
      }),
    ).toEqual({ kind: "first-project" });
    expect(
      resolveT3TeamSetupSurfaceReason({
        allProjects: [localProject, jiraProject],
        selectedProjectId: "unknown-route-project",
        reopenInitialSetup: false,
      }),
    ).toEqual({ kind: "first-project" });
  });

  it("reports null projectTitle when there are multiple projects and none is selected", () => {
    expect(
      resolveT3TeamSetupSurfaceReason({
        allProjects: [localProject, secondLocalProject],
        selectedProjectId: null,
        reopenInitialSetup: false,
      }),
    ).toEqual({ kind: "no-work-project", projectTitle: null });
  });
});
