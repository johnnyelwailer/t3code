import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type CloudSession,
  type RepositoryIdentity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";

const local = EnvironmentId.make("env-local");
const cloud = EnvironmentId.make("env-cloud");
const repo: RepositoryIdentity = {
  canonicalKey: "github.com/acme/app",
  locator: { source: "git-remote", remoteName: "origin", remoteUrl: "git@github.com:acme/app" },
};

function project(
  environmentId: EnvironmentId,
  id: string,
  workspaceRoot: string,
  repositoryIdentity: RepositoryIdentity | null = null,
): EnvironmentProject {
  return {
    environmentId,
    id: ProjectId.make(id),
    title: id,
    workspaceRoot,
    repositoryIdentity,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-10-13T08:00:00.000Z",
    updatedAt: "2026-10-13T08:00:00.000Z",
  };
}

const queued = decodeCloudQueuedSend({
  messageId: "msg-1",
  messageText: "hello",
  outgoingText: "hello",
  titleSeed: "hello",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "machine",
  createdAt: "2026-10-13T08:00:00.000Z",
})!;

const session: CloudSession = {
  sessionId: "session-9",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 150,
  remainingSeconds: null,
  machineLabel: "machine",
  failureReason: null,
  detailsUrl: null,
  environmentId: cloud,
};

function facts(input: {
  readonly draftProject: EnvironmentProject;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly queuedProjectKey?: string | null;
  readonly cloudScratchRoot?: string | null;
}) {
  return resolveCloudQueuedSendFacts({
    queued: { ...queued, projectKey: input.queuedProjectKey ?? null },
    draft: {
      environmentId: input.draftProject.environmentId,
      projectId: input.draftProject.id,
      logicalProjectKey: "unused",
      threadId: ThreadId.make("thread-1"),
    },
    sessions: [session],
    environments: [
      {
        environmentId: local,
        connection: { phase: "connected" },
        serverConfig: { scratchWorkspaceRoot: "/Users/me/.t3/scratch" },
      },
      {
        environmentId: cloud,
        connection: { phase: "connected" },
        serverConfig: {
          scratchWorkspaceRoot:
            input.cloudScratchRoot === undefined
              ? "/home/runner/.t3/scratch"
              : input.cloudScratchRoot,
          cwd: "/workspace/app",
          projectFromCwd: true,
        },
      },
    ],
    projects: [input.draftProject, ...input.projects],
    threadShells: [],
    groupingSettings: {
      sidebarProjectGroupingMode: "repository",
      sidebarProjectGroupingOverrides: {},
    },
  });
}

describe("resolveCloudQueuedSendFacts project wait", () => {
  const draftProject = project(local, "app-local", "/Users/me/app", repo);
  const KEY = "github.com/acme/app";

  it("says nothing once the project is on the machine", () => {
    const own = project(cloud, "app-own", "/workspace/app", repo);
    expect(facts({ draftProject, projects: [own], queuedProjectKey: KEY }).projectWait).toBeNull();
  });

  it("tells an empty project list from a list without the project", () => {
    const empty = facts({ draftProject, projects: [], queuedProjectKey: KEY }).projectWait;
    expect(empty).toMatchObject({
      reason: "project-list-pending",
      environmentId: "env-cloud",
      expectedCwd: "/workspace/app",
      projectsSeen: 0,
      projectTitle: "app-local",
    });
    const other = project(cloud, "elsewhere", "/srv/elsewhere");
    expect(
      facts({ draftProject, projects: [other], queuedProjectKey: KEY }).projectWait,
    ).toMatchObject({
      reason: "project-not-listed",
      projectsSeen: 1,
    });
  });

  it("names a machine project of another repository at the expected folder", () => {
    const foreign = project(cloud, "foreign", "/workspace/app", {
      ...repo,
      canonicalKey: "github.com/acme/other",
    });
    expect(
      facts({ draftProject, projects: [foreign], queuedProjectKey: KEY }).projectWait,
    ).toMatchObject({
      reason: "different-repository",
      machineProjectTitle: "foreign",
    });
  });

  it("names no machine folder when the send's target does not follow this project", () => {
    const foreign = project(cloud, "foreign", "/workspace/app", {
      ...repo,
      canonicalKey: "github.com/acme/other",
    });
    for (const queuedProjectKey of [null, "github.com/acme/elsewhere"]) {
      expect(
        facts({ draftProject, projects: [foreign], queuedProjectKey }).projectWait,
      ).toMatchObject({
        reason: "no-matching-project",
        expectedCwd: null,
        machineProjectTitle: null,
      });
    }
  });

  it("waits on the scratch folder of a No-project draft", () => {
    const scratchDraft = project(local, "scratch-local", "/Users/me/.t3/scratch");
    expect(facts({ draftProject: scratchDraft, projects: [] }).projectWait?.reason).toBe(
      "scratch-opening",
    );
  });

  it("says a No-project draft is held when the machine's settings name no scratch folder", () => {
    const scratchDraft = project(local, "scratch-local", "/Users/me/.t3/scratch");
    const result = facts({ draftProject: scratchDraft, projects: [], cloudScratchRoot: null });
    expect(result).toMatchObject({ scratch: true, project: null, machineConnected: true });
    expect(result.projectWait?.reason).toBe("scratch-folder-unknown");
  });
});

describe("resolveCloudQueuedSendFacts", () => {
  it("binds a No-project draft to the machine's scratch project, absent until opened", () => {
    const scratchDraft = project(local, "scratch-local", "/Users/me/.t3/scratch");
    const before = facts({ draftProject: scratchDraft, projects: [] });
    expect(before).toMatchObject({ scratch: true, project: null, machineConnected: true });
    const cloudScratch = project(cloud, "scratch-cloud", "/home/runner/.t3/scratch");
    expect(facts({ draftProject: scratchDraft, projects: [cloudScratch] }).project?.id).toBe(
      "scratch-cloud",
    );
  });

  it("gives the session's own project precedence over another checkout that groups the same", () => {
    const draftProject = project(local, "app-local", "/Users/me/app", repo);
    const restored = project(cloud, "app-restored", "/srv/other/app", repo);
    const own = project(cloud, "app-own", "/workspace/app");
    const result = facts({
      draftProject,
      projects: [restored, own],
      queuedProjectKey: "github.com/acme/app",
    });
    expect(result.scratch).toBe(false);
    expect(result.project?.id).toBe("app-own");
    // Without the session's own project the grouping match still binds.
    expect(facts({ draftProject, projects: [restored] }).project?.id).toBe("app-restored");
  });
});
