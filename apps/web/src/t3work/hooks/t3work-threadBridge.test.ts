import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectId, ThreadId, type EnvironmentId } from "@t3tools/contracts";

import {
  mapLiveThreadToProjectThread,
  mergeProjectThreads,
  normalizeWorkspaceRootPath,
  remapProjectThreadToStoredProject,
  resolveCanonicalProjectId,
  resolveCanonicalProjectIdForWorkspaceRoot,
  resolveStoredProjectId,
} from "./t3work-threadBridge";
import {
  makeLiveProject,
  makeProjectThread,
  makeStoredProject,
} from "./t3work-threadBridge.testSupport";

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
      [makeLiveProject({ id: ProjectId.make("live-saved"), cwd: "/workspace/saved" })],
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
      [makeLiveProject({ id: ProjectId.make("live-linked"), cwd: "/workspace/references/repo" })],
    );

    expect(canonicalProjectId).toBe(ProjectId.make("live-linked"));
  });
});

describe("resolveCanonicalProjectIdForWorkspaceRoot", () => {
  it("matches a live project when the workspace root only differs by a trailing slash", () => {
    const canonicalProjectId = resolveCanonicalProjectIdForWorkspaceRoot(
      "/workspace/saved/",
      "stored-project",
      [makeLiveProject({ id: ProjectId.make("live-saved"), cwd: "/workspace/saved" })],
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
      [makeLiveProject({ id: ProjectId.make("live-saved"), cwd: "/workspace/saved" })],
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
      [makeLiveProject({ id: ProjectId.make("live-linked"), cwd: "/workspace/references/repo" })],
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
      [makeLiveProject({ id: ProjectId.make("live-saved"), cwd: "/Users/tester/workspace/saved" })],
    );

    expect(resolvedProjectId).toBe("stored-project");
  });
});

describe("remapProjectThreadToStoredProject", () => {
  it("reassigns legacy loose-workspace shadow threads to the owning stored project", () => {
    const storedProjects = [
      makeStoredProject({
        workspace: {
          rootPath: "/workspace/saved",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      }),
    ];
    const liveProjects = [
      makeLiveProject({ id: ProjectId.make("live-saved"), cwd: "/workspace/saved" }),
    ];
    const localThread = makeProjectThread({
      projectId: ProjectId.make("live-saved"),
      ticketId: "ticket-1",
    });
    const liveThread = mapLiveThreadToProjectThread(
      {
        id: "thread-1",
        projectId: ProjectId.make("live-saved"),
        title: "Investigate regression",
        messages: [],
        createdAt: "2026-05-22T09:00:00.000Z",
        updatedAt: "2026-05-22T10:00:00.000Z",
        environmentId: "env-local" as EnvironmentId,
        defaultModelSelection: null,
      } as never,
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

  it("maps durable parent and ticket metadata from live threads", () => {
    expect(
      mapLiveThreadToProjectThread({
        id: "thread-child",
        projectId: ProjectId.make("live-saved"),
        title: "Investigate regression",
        messages: [],
        activities: [
          {
            id: "activity-handoff-1",
            tone: "info",
            kind: "t3work.handoff.created",
            summary: "Created from Parent thread",
            payload: {
              parentThreadId: ThreadId.make("thread-parent"),
              childThreadId: ThreadId.make("thread-child"),
              ticketId: "PROJ-123",
            },
            turnId: null,
            createdAt: "2026-05-22T09:00:00.000Z",
          },
        ],
        latestTurn: null,
        archivedAt: null,
        error: null,
        session: null,
        createdAt: "2026-05-22T09:00:00.000Z",
        updatedAt: "2026-05-22T10:00:00.000Z",
        environmentId: "env-local" as EnvironmentId,
        defaultModelSelection: null,
      } as never),
    ).toEqual(
      expect.objectContaining({
        id: "thread-child",
        parentThreadId: "thread-parent",
        ticketId: "PROJ-123",
      }),
    );
  });
});
