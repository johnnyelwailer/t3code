import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project } from "~/types";
import type { ProjectThread } from "~/t3work/t3work-types";

export function makeLiveProject(overrides: Partial<Project> = {}): Project {
  return {
    id: ProjectId.make("live-project"),
    environmentId: "env-local" as EnvironmentId,
    title: "Loose workspace",
    workspaceRoot: "/workspace/loose",
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    ...overrides,
  };
}

export function makeStoredProject(
  overrides: Partial<ProjectShellProject> = {},
): ProjectShellProject {
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

export function makeProjectThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: "thread-1",
    projectId: "stored-project",
    title: "Investigate regression",
    status: "idle",
    lastMessageAt: "2026-05-22T10:00:00.000Z",
    messageCount: 1,
    createdAt: "2026-05-22T09:00:00.000Z",
    ...overrides,
  };
}
