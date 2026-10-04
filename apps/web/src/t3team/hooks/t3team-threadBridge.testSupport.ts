import { ProjectId, ProviderInstanceId, ThreadId, type EnvironmentId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, ThreadShell } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";

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
    createdAt: "2026-05-22T09:00:00.000Z",
    ...overrides,
  };
}

/**
 * A live thread SHELL — the only thing the t3team store reads per row. Defaults to a settled,
 * idle root thread in `live-project`; override just the fields under test.
 */
export function makeLiveThreadShell(overrides: Partial<ThreadShell> = {}): ThreadShell {
  return {
    id: ThreadId.make("thread-1"),
    environmentId: "env-local" as EnvironmentId,
    projectId: ProjectId.make("live-project"),
    title: "Investigate regression",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    latestTurn: null,
    createdAt: "2026-05-22T09:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...overrides,
  };
}
