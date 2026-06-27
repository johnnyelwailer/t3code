import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { Project } from "~/types";
import { deriveLooseWorkspaceProjects } from "./t3work-projectStoreUtils";

function makeStoredProject(overrides: Partial<ProjectShellProject> = {}): ProjectShellProject {
  return {
    id: "stored-project" as never,
    title: "Saved project",
    source: {
      provider: "atlassian",
      externalProjectId: "jira-123",
    },
    workspace: {
      rootPath: "/workspace/saved",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    ...overrides,
  };
}

function makeLiveProject(overrides: Partial<Project> = {}): Project {
  return {
    id: ProjectId.make("live-project"),
    environmentId: "env-local" as EnvironmentId,
    title: "Loose workspace",
    workspaceRoot: "/workspace/loose",
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deriveLooseWorkspaceProjects", () => {
  it("adds live local workspaces that are not already part of a t3work project", () => {
    const looseWorkspaceProjects = deriveLooseWorkspaceProjects(
      [makeStoredProject()],
      [makeLiveProject()],
    );

    expect(looseWorkspaceProjects).toHaveLength(1);
    expect(looseWorkspaceProjects[0]).toMatchObject({
      id: ProjectId.make("live-project"),
      title: "Loose workspace",
      source: {
        provider: "local",
        externalProjectId: ProjectId.make("live-project"),
      },
      workspace: {
        rootPath: "/workspace/loose",
      },
    });
  });

  it("does not duplicate a live workspace that already backs a saved project", () => {
    const looseWorkspaceProjects = deriveLooseWorkspaceProjects(
      [makeStoredProject()],
      [makeLiveProject({ workspaceRoot: "/workspace/saved" })],
    );

    expect(looseWorkspaceProjects).toEqual([]);
  });

  it("does not duplicate a live workspace when the saved project root has a trailing slash", () => {
    const looseWorkspaceProjects = deriveLooseWorkspaceProjects(
      [
        makeStoredProject({
          workspace: {
            rootPath: "/workspace/saved/",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        }),
      ],
      [makeLiveProject({ workspaceRoot: "/workspace/saved" })],
    );

    expect(looseWorkspaceProjects).toEqual([]);
  });

  it("does not duplicate a live workspace owned through a linked repository local path", () => {
    const looseWorkspaceProjects = deriveLooseWorkspaceProjects(
      [
        makeStoredProject({
          source: {
            provider: "atlassian",
            externalProjectId: "jira-123",
            raw: {
              agentReferences: {
                linkedRepositories: [
                  {
                    url: "https://github.com/acme/repo",
                    localPath: "/workspace/references/repo",
                  },
                ],
              },
            },
          },
        }),
      ],
      [makeLiveProject({ workspaceRoot: "/workspace/references/repo" })],
    );

    expect(looseWorkspaceProjects).toEqual([]);
  });

  it("does not duplicate a live workspace when a linked repository path differs only by a trailing slash", () => {
    const looseWorkspaceProjects = deriveLooseWorkspaceProjects(
      [
        makeStoredProject({
          source: {
            provider: "atlassian",
            externalProjectId: "jira-123",
            raw: {
              agentReferences: {
                linkedRepositories: [
                  {
                    url: "https://github.com/acme/repo",
                    localPath: "/workspace/references/repo/",
                  },
                ],
              },
            },
          },
        }),
      ],
      [makeLiveProject({ workspaceRoot: "/workspace/references/repo" })],
    );

    expect(looseWorkspaceProjects).toEqual([]);
  });

  it("does not duplicate a live workspace when the saved project root uses a home shortcut", () => {
    vi.stubEnv("HOME", "/Users/tester");

    const looseWorkspaceProjects = deriveLooseWorkspaceProjects(
      [
        makeStoredProject({
          workspace: {
            rootPath: "~/workspace/saved",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        }),
      ],
      [makeLiveProject({ workspaceRoot: "/Users/tester/workspace/saved" })],
    );

    expect(looseWorkspaceProjects).toEqual([]);
  });

  it("does not duplicate a live workspace when the saved project already has the same id", () => {
    const looseWorkspaceProjects = deriveLooseWorkspaceProjects(
      [
        makeStoredProject({
          id: ProjectId.make("live-project") as never,
          workspace: {
            rootPath: "~/.t3code/t3work/projects/IES NG",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        }),
      ],
      [
        makeLiveProject({
          id: ProjectId.make("live-project"),
          workspaceRoot: "/Users/tester/.t3code/t3work/projects/IES NG",
        }),
      ],
    );

    expect(looseWorkspaceProjects).toEqual([]);
  });

  it("does not duplicate a live repo subdirectory when its repository root is owned", () => {
    const looseWorkspaceProjects = deriveLooseWorkspaceProjects(
      [
        makeStoredProject({
          workspace: undefined,
          source: {
            provider: "atlassian",
            externalProjectId: "jira-123",
            raw: {
              agentReferences: {
                linkedRepositories: [
                  {
                    url: "https://github.com/acme/repo",
                    localPath: "/workspace/references/repo",
                  },
                ],
              },
            },
          },
        }),
      ],
      [
        makeLiveProject({
          workspaceRoot: "/workspace/references/repo/apps/web",
          repositoryIdentity: {
            canonicalKey: "github.com/acme/repo",
            locator: {
              source: "git-remote",
              remoteName: "origin",
              remoteUrl: "https://github.com/acme/repo",
            },
            rootPath: "/workspace/references/repo",
          },
        }),
      ],
    );

    expect(looseWorkspaceProjects).toEqual([]);
  });
});
