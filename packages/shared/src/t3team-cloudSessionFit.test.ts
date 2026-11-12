import { describe, expect, it } from "vite-plus/test";
import {
  type CloudSession,
  plainProjectFolderName,
  ProjectId,
  type RepositoryIdentity,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  CLOUD_SESSION_MIN_REMAINING_SECONDS,
  cloudSessionNameSegment,
  cloudSessionProjectMismatchOf,
  isSameCloudSessionProject,
  ownProjectOnMachine,
  projectCwdOf,
  selectFittingCloudSession,
} from "./t3team-cloudSessionFit.ts";

const NOW = Date.parse("2026-10-24T12:00:00.000Z");

const isoAt = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

const session = (overrides: Partial<CloudSession>): CloudSession => ({
  sessionId: "100",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 60,
  name: "nx-nexi",
  startedAt: "2026-10-24T11:00:00.000Z",
  remainingSeconds: 3600,
  endsAt: isoAt(NOW + 3 * 3600 * 1000),
  machineLabel: "ubuntu",
  failureReason: null,
  detailsUrl: null,
  environmentId: "env-100",
  transport: "nexi_broker",
  ...overrides,
});

const identity = (canonicalKey: string): RepositoryIdentity => ({
  canonicalKey,
  locator: { source: "git-remote", remoteName: "origin", remoteUrl: `https://x/${canonicalKey}` },
});

describe("selectFittingCloudSession", () => {
  it("picks the ready session for the repository with the most hold left", () => {
    const sessions = [
      session({ sessionId: "1", endsAt: isoAt(NOW + 3600 * 1000) }),
      session({ sessionId: "2", endsAt: isoAt(NOW + 4 * 3600 * 1000) }),
      session({ sessionId: "3", name: "other-repo" }),
    ];
    expect(selectFittingCloudSession({ sessions, repositoryName: "NX-Nexi", nowMs: NOW })).toEqual({
      kind: "ready",
      session: sessions[1],
    });
  });

  it("skips a ready session about to release its machine", () => {
    const closing = session({
      endsAt: isoAt(NOW + (CLOUD_SESSION_MIN_REMAINING_SECONDS - 60) * 1000),
    });
    expect(
      selectFittingCloudSession({ sessions: [closing], repositoryName: "nx-nexi", nowMs: NOW }),
    ).toBeNull();
  });

  it("falls back to the newest session still starting", () => {
    const sessions = [
      session({ sessionId: "1", phase: "preparing", environmentId: undefined, endsAt: undefined }),
      session({
        sessionId: "2",
        phase: "queued",
        startedAt: "2026-10-24T11:59:00.000Z",
        environmentId: undefined,
        endsAt: undefined,
      }),
      session({ sessionId: "3", phase: "failed" }),
    ];
    expect(selectFittingCloudSession({ sessions, repositoryName: "nx-nexi", nowMs: NOW })).toEqual({
      kind: "starting",
      session: sessions[1],
    });
  });

  it("only offers sessions the broker reaches, and none for a project without a repository", () => {
    const relay = session({ transport: "t3_connect" });
    expect(
      selectFittingCloudSession({ sessions: [relay], repositoryName: "nx-nexi", nowMs: NOW }),
    ).toBeNull();
    expect(
      selectFittingCloudSession({ sessions: [session({})], repositoryName: null, nowMs: NOW }),
    ).toBeNull();
  });

  it("leaves out excluded sessions, such as one whose own project did not match", () => {
    expect(
      selectFittingCloudSession({
        sessions: [session({ sessionId: "1" })],
        repositoryName: "nx-nexi",
        nowMs: NOW,
        excludeSessionIds: ["1"],
      }),
    ).toBeNull();
  });
});

describe("selectFittingCloudSession edge cases", () => {
  it("matches a repository name through the session tag's name segment", () => {
    const dotted = session({ sessionId: "1", name: "my-repo" });
    expect(
      selectFittingCloudSession({ sessions: [dotted], repositoryName: "My.Repo", nowMs: NOW }),
    ).toEqual({ kind: "ready", session: dotted });
    const longName = "a-very-long-repository-name-that-goes-past-forty-characters";
    const truncated = session({ sessionId: "2", name: cloudSessionNameSegment(longName) });
    expect(truncated.name?.length).toBe(40);
    expect(
      selectFittingCloudSession({ sessions: [truncated], repositoryName: longName, nowMs: NOW }),
    ).toEqual({ kind: "ready", session: truncated });
  });

  it("treats a ready session whose environment is not linked yet as starting", () => {
    const unlinked = session({ environmentId: undefined });
    expect(
      selectFittingCloudSession({ sessions: [unlinked], repositoryName: "nx-nexi", nowMs: NOW }),
    ).toEqual({ kind: "starting", session: unlinked });
  });

  it("does not reuse a ready session whose hold is unknown", () => {
    const unknown = session({ endsAt: undefined, remainingSeconds: null });
    expect(
      selectFittingCloudSession({ sessions: [unknown], repositoryName: "nx-nexi", nowMs: NOW }),
    ).toBeNull();
  });

  it("breaks a tie on hold left by session id", () => {
    const sessions = [session({ sessionId: "9" }), session({ sessionId: "3" })];
    expect(
      selectFittingCloudSession({ sessions, repositoryName: "nx-nexi", nowMs: NOW })?.session
        .sessionId,
    ).toBe("3");
  });
});

describe("own project on the machine", () => {
  it("reads the registered working directory only when the server registers one", () => {
    expect(projectCwdOf({ cwd: "/work/nx-nexi", projectFromCwd: true })).toBe("/work/nx-nexi");
    expect(projectCwdOf({ cwd: "/work/nx-nexi" })).toBeNull();
    expect(projectCwdOf(null)).toBeNull();
  });

  it("finds the project at the server's working directory", () => {
    const projects = [
      { id: "a", workspaceRoot: "/work/other" },
      { id: "b", workspaceRoot: "/work/nx-nexi/" },
    ];
    expect(ownProjectOnMachine("/work/nx-nexi", projects)?.id).toBe("b");
  });

  it("matches by repository, and a different repository is never the same project", () => {
    const local = {
      id: ProjectId.make("p1"),
      title: "Nexi",
      workspaceRoot: "/Users/pj/nx-nexi",
      repositoryIdentity: identity("ghe/hive/nx-nexi"),
    };
    expect(
      isSameCloudSessionProject(local, {
        workspaceRoot: "/work/nx-nexi",
        repositoryIdentity: identity("ghe/hive/nx-nexi"),
      }),
    ).toBe(true);
    expect(isSameCloudSessionProject(local, { workspaceRoot: "/work/nx-nexi" })).toBe(true);
    expect(
      isSameCloudSessionProject(local, {
        workspaceRoot: "/work/nx-nexi",
        repositoryIdentity: identity("ghe/hive/other"),
      }),
    ).toBe(false);
  });
});

describe("cloudSessionProjectMismatchOf", () => {
  const withRemote = {
    id: ProjectId.make("p1"),
    title: "Nexi",
    workspaceRoot: "/Users/pj/nx-nexi",
    repositoryIdentity: identity("ghe/hive/nx-nexi"),
  };
  const plain = {
    id: ProjectId.make("p2"),
    title: "notes",
    workspaceRoot: "/Users/pj/notes",
    repositoryIdentity: null,
  };
  const cases = [
    {
      local: withRemote,
      own: { workspaceRoot: "/w/a", repositoryIdentity: identity("ghe/hive/nx-nexi") },
      kind: null,
    },
    { local: withRemote, own: { workspaceRoot: "/w/a" }, kind: null },
    {
      local: withRemote,
      own: { workspaceRoot: "/w/a", repositoryIdentity: identity("ghe/hive/other") },
      kind: "repository",
    },
    {
      local: plain,
      own: { workspaceRoot: "/w/a", repositoryIdentity: identity("ghe/hive/other") },
      kind: "repository",
    },
    { local: plain, own: { workspaceRoot: "/w/a" }, kind: "folder" },
    {
      local: plain,
      own: { workspaceRoot: `/w/${plainProjectFolderName(plain.title, plain.id)}` },
      kind: null,
    },
  ] as const;

  it("names why a machine project is not the session's, and agrees with isSameCloudSessionProject", () => {
    for (const { local, own, kind } of cases) {
      expect(cloudSessionProjectMismatchOf(local, own)).toBe(kind);
      expect(isSameCloudSessionProject(local, own)).toBe(kind === null);
    }
  });
});
