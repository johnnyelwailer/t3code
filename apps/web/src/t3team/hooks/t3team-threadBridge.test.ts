import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ProjectId, ThreadId } from "@t3tools/contracts";

import {
  mapLiveThreadToProjectThread,
  mergeProjectThreads,
  normalizeWorkspaceRootPath,
  remapProjectThreadToStoredProject,
  resolveCanonicalProjectId,
  resolveCanonicalProjectIdForWorkspaceRoot,
  resolveStoredProjectId,
} from "./t3team-threadBridge";
import {
  makeLiveProject,
  makeLiveThreadShell,
  makeProjectThread,
  makeStoredProject,
} from "./t3team-threadBridge.testSupport";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeWorkspaceRootPath", () => {
  it("strips trailing slashes and normalizes drive separators", () => {
    expect(normalizeWorkspaceRootPath("/workspace/project///")).toBe("/workspace/project");
    expect(normalizeWorkspaceRootPath("c:\\workspace\\project\\")).toBe("C:/workspace/project");
  });

  it("expands a leading home shortcut when a home directory is available", () => {
    vi.stubEnv("HOME", "/Users/tester");

    expect(normalizeWorkspaceRootPath("~/workspace/project/")).toBe(
      "/Users/tester/workspace/project",
    );
  });
});

describe("resolveCanonicalProjectId", () => {
  it("matches a live project when the stored workspace root only differs by a trailing slash", () => {
    const canonicalProjectId = resolveCanonicalProjectId(
      makeStoredProject({
        workspace: {
          rootPath: "/workspace/saved/",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      }),
      [makeLiveProject({ id: ProjectId.make("live-saved"), workspaceRoot: "/workspace/saved" })],
    );

    expect(canonicalProjectId).toBe(ProjectId.make("live-saved"));
  });

  it("matches a live project through a linked repository path when the stored project has no workspace root", () => {
    const canonicalProjectId = resolveCanonicalProjectId(
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
                  localPath: "/workspace/references/repo/",
                },
              ],
            },
          },
        },
      }),
      [
        makeLiveProject({
          id: ProjectId.make("live-linked"),
          workspaceRoot: "/workspace/references/repo",
        }),
      ],
    );

    expect(canonicalProjectId).toBe(ProjectId.make("live-linked"));
  });

  it("matches a live project through repository root identity when cwd is nested", () => {
    const canonicalProjectId = resolveCanonicalProjectId(
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
                  localPath: "/workspace/references/repo/",
                },
              ],
            },
          },
        },
      }),
      [
        makeLiveProject({
          id: ProjectId.make("live-linked"),
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

    expect(canonicalProjectId).toBe(ProjectId.make("live-linked"));
  });
});

describe("resolveCanonicalProjectIdForWorkspaceRoot", () => {
  it("matches a live project when the workspace root only differs by a trailing slash", () => {
    const canonicalProjectId = resolveCanonicalProjectIdForWorkspaceRoot(
      "/workspace/saved/",
      "stored-project",
      [makeLiveProject({ id: ProjectId.make("live-saved"), workspaceRoot: "/workspace/saved" })],
    );

    expect(canonicalProjectId).toBe(ProjectId.make("live-saved"));
  });
});

describe("resolveStoredProjectId", () => {
  it("maps an owned live workspace id back to the stored project id", () => {
    const resolvedProjectId = resolveStoredProjectId(
      ProjectId.make("live-saved"),
      [
        makeStoredProject({
          workspace: {
            rootPath: "/workspace/saved/",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        }),
      ],
      [makeLiveProject({ id: ProjectId.make("live-saved"), workspaceRoot: "/workspace/saved" })],
    );

    expect(resolvedProjectId).toBe("stored-project");
  });

  it("maps an owned live workspace id back to the stored project id through linked repository paths", () => {
    const resolvedProjectId = resolveStoredProjectId(
      ProjectId.make("live-linked"),
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
                    localPath: "/workspace/references/repo/",
                  },
                ],
              },
            },
          },
        }),
      ],
      [
        makeLiveProject({
          id: ProjectId.make("live-linked"),
          workspaceRoot: "/workspace/references/repo",
        }),
      ],
    );

    expect(resolvedProjectId).toBe("stored-project");
  });

  it("maps an owned live workspace id back through repository root identity when cwd is nested", () => {
    const resolvedProjectId = resolveStoredProjectId(
      ProjectId.make("live-linked"),
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
                    localPath: "/workspace/references/repo/",
                  },
                ],
              },
            },
          },
        }),
      ],
      [
        makeLiveProject({
          id: ProjectId.make("live-linked"),
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

    expect(resolvedProjectId).toBe("stored-project");
  });

  it("maps an owned live workspace id back to the stored project id when the saved root uses a home shortcut", () => {
    vi.stubEnv("HOME", "/Users/tester");

    const resolvedProjectId = resolveStoredProjectId(
      ProjectId.make("live-saved"),
      [
        makeStoredProject({
          workspace: {
            rootPath: "~/workspace/saved",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        }),
      ],
      [
        makeLiveProject({
          id: ProjectId.make("live-saved"),
          workspaceRoot: "/Users/tester/workspace/saved",
        }),
      ],
    );

    expect(resolvedProjectId).toBe("stored-project");
  });
});

const LIVE_SAVED = ProjectId.make("live-saved");

function savedWorkspace() {
  return {
    storedProjects: [
      makeStoredProject({
        workspace: {
          rootPath: "/workspace/saved",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      }),
    ],
    liveProjects: [makeLiveProject({ id: LIVE_SAVED, workspaceRoot: "/workspace/saved" })],
  };
}

describe("remapProjectThreadToStoredProject", () => {
  it("reassigns legacy loose-workspace shadow threads to the owning stored project", () => {
    const { storedProjects, liveProjects } = savedWorkspace();
    const localThread = makeProjectThread({
      projectId: LIVE_SAVED,
      ticketId: "ticket-1",
    });
    const liveThread = mapLiveThreadToProjectThread(
      makeLiveThreadShell({ id: ThreadId.make("thread-1"), projectId: LIVE_SAVED }),
      "stored-project",
    );

    expect(
      mergeProjectThreads([
        remapProjectThreadToStoredProject(localThread, storedProjects, liveProjects),
        liveThread,
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "thread-1",
        projectId: "stored-project",
        ticketId: "ticket-1",
      }),
    ]);
  });
});
