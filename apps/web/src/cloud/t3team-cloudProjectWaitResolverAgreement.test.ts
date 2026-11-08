/**
 * The "Project ready" diagnostic must not disagree with the resolver whose answer it explains:
 * both are fed the SAME fixtures here and the diagnostic's reason must follow from what the
 * resolver (`resolveCloudSessionOwnProject`) did with them. Both read the machine's own project
 * and the mismatch kind from `@t3tools/shared/t3team-cloudSessionFit`.
 */
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type CloudSession,
  type RepositoryIdentity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveLogicalProjectKeyFromSettings } from "@t3tools/client-runtime/state/project-grouping";
import { type CloudProjectWaitReason } from "./t3team-cloudProjectWait";
import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { projectCwdOf, resolveCloudSessionOwnProject } from "./t3team-cloudSessionOwnProject";

const local = EnvironmentId.make("env-local");
const cloud = EnvironmentId.make("env-cloud");
const repo: RepositoryIdentity = {
  canonicalKey: "github.com/acme/app",
  locator: { source: "git-remote", remoteName: "origin", remoteUrl: "git@github.com:acme/app" },
};
const otherRepo: RepositoryIdentity = { ...repo, canonicalKey: "github.com/acme/other" };
const groupingSettings = {
  sidebarProjectGroupingMode: "repository",
  sidebarProjectGroupingOverrides: {},
} as const;

const project = (
  environmentId: EnvironmentId,
  id: string,
  workspaceRoot: string,
  repositoryIdentity: RepositoryIdentity | null = null,
): EnvironmentProject => ({
  environmentId,
  id: ProjectId.make(id),
  title: id,
  workspaceRoot,
  repositoryIdentity,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-13T08:00:00.000Z",
  updatedAt: "2026-10-13T08:00:00.000Z",
});

const baseQueued = decodeCloudQueuedSend({
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

type ResolverOutcome = "none" | "held" | "bound";

interface Fixture {
  readonly name: string;
  readonly draft: EnvironmentProject;
  readonly machineProjects: ReadonlyArray<EnvironmentProject>;
  /** The environment's settings; null = they have not arrived. */
  readonly cloudConfig: {
    readonly scratchWorkspaceRoot: string | null;
    readonly cwd?: string;
    readonly projectFromCwd?: boolean;
  } | null;
  /** Whether the send's Run-on target follows the draft's project. */
  readonly follows: boolean;
  readonly reason: CloudProjectWaitReason | null;
  /** What the resolver does with the same facts; null = it is not consulted (scratch). */
  readonly resolver: ResolverOutcome | null;
}

const settings = (extra: object = {}) => ({
  scratchWorkspaceRoot: "/home/runner/.t3/scratch",
  cwd: "/workspace/app",
  projectFromCwd: true,
  ...extra,
});
const appLocal = project(local, "app-local", "/Users/me/app", repo);
const plainLocal = project(local, "notes", "/Users/me/notes");
const scratchLocal = project(local, "scratch-local", "/Users/me/.t3/scratch");

const fixtures: ReadonlyArray<Fixture> = [
  {
    name: "environment settings have not arrived",
    draft: appLocal,
    machineProjects: [],
    cloudConfig: null,
    follows: true,
    reason: "machine-settings-pending",
    resolver: "none",
  },
  {
    name: "project list is empty",
    draft: appLocal,
    machineProjects: [],
    cloudConfig: settings(),
    follows: true,
    reason: "project-list-pending",
    resolver: "held",
  },
  {
    name: "folder known but no project listed there",
    draft: appLocal,
    machineProjects: [project(cloud, "elsewhere", "/srv/elsewhere")],
    cloudConfig: settings(),
    follows: true,
    reason: "project-not-listed",
    resolver: "held",
  },
  {
    name: "a project of another repository at the folder",
    draft: appLocal,
    machineProjects: [project(cloud, "foreign", "/workspace/app", otherRepo)],
    cloudConfig: settings(),
    follows: true,
    reason: "different-repository",
    resolver: "none",
  },
  {
    name: "a project without a remote at another folder name",
    draft: plainLocal,
    machineProjects: [project(cloud, "other-folder", "/workspace/app")],
    cloudConfig: settings(),
    follows: true,
    reason: "different-folder",
    resolver: "none",
  },
  {
    name: "a project without a remote vs a checkout with a remote",
    draft: plainLocal,
    machineProjects: [project(cloud, "with-remote", "/workspace/app", repo)],
    cloudConfig: settings(),
    follows: true,
    reason: "different-repository",
    resolver: "none",
  },
  {
    name: "the target does not follow this project",
    draft: appLocal,
    machineProjects: [project(cloud, "foreign", "/workspace/app", otherRepo)],
    cloudConfig: settings(),
    follows: false,
    reason: "no-matching-project",
    resolver: "none",
  },
  {
    name: "the machine registers no project from its folder",
    draft: appLocal,
    machineProjects: [project(cloud, "foreign", "/workspace/app", otherRepo)],
    cloudConfig: settings({ projectFromCwd: false }),
    follows: true,
    reason: "no-matching-project",
    resolver: "none",
  },
  {
    name: "scratch draft, scratch folder not open yet",
    draft: scratchLocal,
    machineProjects: [],
    cloudConfig: settings(),
    follows: false,
    reason: "scratch-opening",
    resolver: null,
  },
  {
    name: "scratch draft, settings name no scratch folder",
    draft: scratchLocal,
    machineProjects: [],
    cloudConfig: settings({ scratchWorkspaceRoot: null }),
    follows: false,
    reason: "scratch-folder-unknown",
    resolver: null,
  },
  {
    name: "the machine's own project is listed and matches",
    draft: appLocal,
    machineProjects: [project(cloud, "app-own", "/workspace/app", repo)],
    cloudConfig: settings(),
    follows: true,
    reason: null,
    resolver: "bound",
  },
  {
    name: "the machine's own project has no identity yet",
    draft: appLocal,
    machineProjects: [project(cloud, "app-own", "/workspace/app")],
    cloudConfig: settings(),
    follows: true,
    reason: null,
    resolver: "bound",
  },
];

describe("the project-wait diagnostic and the own-project resolver agree", () => {
  it.each(fixtures)("$name", (fixture) => {
    const projects = [fixture.draft, ...fixture.machineProjects];
    const projectKey = deriveLogicalProjectKeyFromSettings(fixture.draft, groupingSettings);
    const queued = { ...baseQueued, projectKey: fixture.follows ? projectKey : null };
    const environments = [
      {
        environmentId: local,
        connection: { phase: "connected" },
        serverConfig: { scratchWorkspaceRoot: "/Users/me/.t3/scratch" },
      },
      {
        environmentId: cloud,
        connection: { phase: "connected" },
        serverConfig: fixture.cloudConfig,
      },
    ];

    const facts = resolveCloudQueuedSendFacts({
      queued,
      draft: {
        environmentId: fixture.draft.environmentId,
        projectId: fixture.draft.id,
        logicalProjectKey: "unused",
        threadId: ThreadId.make("thread-1"),
      },
      sessions: [session],
      environments,
      projects,
      threadShells: [],
      groupingSettings,
    });
    const own = resolveCloudSessionOwnProject({
      target: { sessionId: queued.sessionId, projectKey: queued.projectKey ?? null },
      project: fixture.draft,
      projectKey,
      sessions: [session],
      serverCwdOf: (id) =>
        projectCwdOf(
          environments.find((environment) => environment.environmentId === id)?.serverConfig,
        ),
      projects,
    });
    const resolver: ResolverOutcome =
      own === null ? "none" : own.projectId === null ? "held" : "bound";

    // The wait is reported exactly while the send has no project to bind to.
    expect(facts.projectWait?.reason ?? null).toBe(fixture.reason);
    expect(facts.project === null).toBe(fixture.reason !== null);
    if (fixture.resolver === null) return;
    expect(resolver).toBe(fixture.resolver);
    if (resolver === "bound") {
      expect(facts.project?.id).toBe(own?.projectId);
      return;
    }
    // Whenever the resolver refuses or holds, the diagnostic names a reason that fits that.
    const reason = facts.projectWait?.reason;
    if (resolver === "held")
      expect(["project-list-pending", "project-not-listed"]).toContain(reason);
    if (reason === "different-repository" || reason === "different-folder") {
      expect(resolver).toBe("none");
      expect(facts.projectWait?.machineProjectTitle).not.toBeNull();
    }
  });
});
