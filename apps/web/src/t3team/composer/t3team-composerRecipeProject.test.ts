import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { type ProjectShellProject, ProjectShellProjectId } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import { resolveComposerRecipeProject } from "~/t3team/composer/t3team-composerRecipeProject";
import type { Project } from "~/types";

const storedTeamProject: ProjectShellProject = {
  id: ProjectShellProjectId.make("team-project"),
  title: "Kreditoren",
  source: { provider: "atlassian", externalProjectId: "jira-123" },
  workspace: { rootPath: "D:/wt/kreditoren", createdAt: "2026-05-01T00:00:00.000Z" },
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
};

function liveProject(id: string, workspaceRoot: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId: EnvironmentId.make("env-local"),
    title: id,
    workspaceRoot,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
  };
}

const looseLive = liveProject("sc-workspace", "D:/wt/sc-workspace");
const teamLive = liveProject("team-project", "D:/wt/kreditoren");

describe("resolveComposerRecipeProject", () => {
  it("resolves a plain workspace project with no Team project to its loose stand-in", () => {
    const project = resolveComposerRecipeProject({
      projectId: "sc-workspace",
      storedProjects: [storedTeamProject],
      liveProjects: [teamLive, looseLive],
    });
    expect(project).toMatchObject({
      id: "sc-workspace",
      source: { provider: "local" },
      workspace: { rootPath: "D:/wt/sc-workspace" },
    });
  });

  it("prefers the stored Team project and waits for the stored list to hydrate", () => {
    const liveProjects = [teamLive, looseLive];
    expect(
      resolveComposerRecipeProject({
        projectId: "team-project",
        storedProjects: [storedTeamProject],
        liveProjects,
      })?.source.provider,
    ).toBe("atlassian");
    expect(
      resolveComposerRecipeProject({
        projectId: "sc-workspace",
        storedProjects: null,
        liveProjects,
      }),
    ).toBeNull();
  });
});
