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
const KEY = "github.com/acme/app";
const repo = (canonicalKey: string): RepositoryIdentity => ({
  canonicalKey,
  locator: { source: "git-remote", remoteName: "origin", remoteUrl: `git@${canonicalKey}` },
});

function project(environmentId: EnvironmentId, id: string, root: string, key?: string) {
  return {
    environmentId,
    id: ProjectId.make(id),
    title: id,
    workspaceRoot: root,
    repositoryIdentity: key === undefined ? null : repo(key),
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-10-13T08:00:00.000Z",
    updatedAt: "2026-10-13T08:00:00.000Z",
  } satisfies EnvironmentProject;
}

const session = {
  sessionId: "session-9",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 150,
  remainingSeconds: null,
  machineLabel: "machine",
  failureReason: null,
  detailsUrl: null,
  environmentId: cloud,
} satisfies CloudSession;

function facts(input: {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  /** The machine's settings (`cwd`); null while they have not reached this app. */
  readonly cwd: string | null;
  readonly bootstrap?: string | null;
  readonly sendInMachineProject?: boolean;
}) {
  const draftProject = project(local, "app-local", "/Users/me/app", KEY);
  return resolveCloudQueuedSendFacts({
    queued: {
      ...decodeCloudQueuedSend({
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
      })!,
      projectKey: KEY,
      ...(input.sendInMachineProject ? { sendInMachineProject: true } : {}),
    },
    draft: {
      environmentId: local,
      projectId: draftProject.id,
      logicalProjectKey: "unused",
      threadId: ThreadId.make("thread-1"),
    },
    sessions: [session],
    environments: [
      { environmentId: local, connection: { phase: "connected" }, serverConfig: null },
      {
        environmentId: cloud,
        connection: { phase: "connected" },
        serverConfig:
          input.cwd === null
            ? null
            : {
                scratchWorkspaceRoot: "/home/runner/.t3/scratch",
                cwd: input.cwd,
                projectFromCwd: true,
              },
      },
    ],
    projects: [draftProject, ...input.projects],
    threadShells: [],
    groupingSettings: {
      sidebarProjectGroupingMode: "repository",
      sidebarProjectGroupingOverrides: {},
    },
    bootstrapProjectIdOf: () =>
      input.bootstrap === undefined || input.bootstrap === null
        ? null
        : ProjectId.make(input.bootstrap),
  });
}

describe("binding by the machine's own bootstrap project", () => {
  const own = project(cloud, "boot-1", "/workspace/app", KEY);

  it("resolves from the welcome's id before the machine's settings have arrived", () => {
    // A checkout that carries no repository identity yet is only known by its folder, and the
    // folder comes from the settings: on main this waits as `machine-settings-pending`.
    const bare = project(cloud, "boot-1", "/workspace/app");
    const result = facts({ projects: [bare], cwd: null, bootstrap: "boot-1" });
    expect(result.project?.id).toBe("boot-1");
    expect(result.projectResolvedBy).toBe("bootstrap-id");
    expect(facts({ projects: [bare], cwd: null }).projectWait?.reason).toBe(
      "machine-settings-pending",
    );
  });

  it("prefers the id over a different project listed at the machine's folder", () => {
    const sameFolder = project(cloud, "restored-at-cwd", "/workspace/app", KEY);
    const result = facts({
      projects: [sameFolder, own],
      cwd: "/workspace/app",
      bootstrap: "boot-1",
    });
    expect(result.project?.id).toBe("boot-1");
    expect(result.projectResolvedBy).toBe("bootstrap-id");
    // Without the welcome the folder decides, as before.
    const byFolder = facts({ projects: [sameFolder, own], cwd: "/workspace/app" });
    expect(byFolder.project?.id).toBe("restored-at-cwd");
    expect(byFolder.projectResolvedBy).toBe("folder");
  });

  it("falls back to the folder when the id names a project not listed here", () => {
    const result = facts({ projects: [own], cwd: "/workspace/app", bootstrap: "never-listed" });
    expect(result.project?.id).toBe("boot-1");
    expect(result.projectResolvedBy).toBe("folder");
  });

  it("does not bind the draft to another repository's bootstrap project", () => {
    const foreign = project(cloud, "boot-foreign", "/workspace/other", "github.com/acme/other");
    const result = facts({
      projects: [foreign],
      cwd: "/workspace/other",
      bootstrap: "boot-foreign",
    });
    expect(result.project).toBeNull();
    expect(result.projectResolvedBy).toBeNull();
  });

  it("binds it when the user chose the machine's own project, whatever repository", () => {
    const foreign = project(cloud, "boot-foreign", "/workspace/other", "github.com/acme/other");
    const result = facts({
      projects: [foreign],
      cwd: "/workspace/other",
      bootstrap: "boot-foreign",
      sendInMachineProject: true,
    });
    expect(result.project?.id).toBe("boot-foreign");
    expect(result.projectResolvedBy).toBe("bootstrap-id");
    const byFolder = facts({
      projects: [foreign],
      cwd: "/workspace/other",
      sendInMachineProject: true,
    });
    expect(byFolder.project?.id).toBe("boot-foreign");
    expect(byFolder.projectResolvedBy).toBe("folder");
  });

  it("holds the choice while the machine's project is not listed", () => {
    const result = facts({ projects: [], cwd: "/workspace/other", sendInMachineProject: true });
    expect(result.project).toBeNull();
    expect(result.projectWait).not.toBeNull();
  });
});
