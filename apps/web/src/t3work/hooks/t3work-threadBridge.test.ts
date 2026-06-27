import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ProjectId, ThreadId, type EnvironmentId } from "@t3tools/contracts";

import {
  mapLiveThreadToProjectThread,
  mergeProjectThreads,
  normalizeWorkspaceRootPath,
  remapProjectThreadToStoredProject,
  resolveCanonicalProjectId,
  resolveCanonicalProjectIdForWorkspaceRoot,
  resolveStoredProjectId,
  syncLiveThreadMetadataToLocalState,
} from "./t3work-threadBridge";
import {
  makeLiveProject,
  makeProjectThread,
  makeStoredProject,
} from "./t3work-threadBridge.testSupport";
import { resolveThreadStatusPill } from "~/t3work/components/t3work-projectSidebarShared";

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
      makeLiveProject({ id: ProjectId.make("live-saved"), workspaceRoot: "/workspace/saved" }),
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

  it("maps durable ticket metadata even when no parent thread is recorded", () => {
    expect(
      mapLiveThreadToProjectThread({
        id: "thread-ticket-root",
        projectId: ProjectId.make("live-saved"),
        title: "Investigate sibling ticket",
        messages: [],
        activities: [
          {
            id: "activity-handoff-2",
            tone: "info",
            kind: "t3work.handoff.created",
            summary: "Created from Parent thread",
            payload: {
              childThreadId: ThreadId.make("thread-ticket-root"),
              ticketId: "proj-456",
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
        id: "thread-ticket-root",
        ticketId: "proj-456",
      }),
    );
  });

  it("shadows live child-thread metadata into local state during startup hydration", () => {
    const storedProjects = [
      makeStoredProject({
        workspace: {
          rootPath: "/workspace/saved",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      }),
    ];
    const liveProjects = [
      makeLiveProject({ id: ProjectId.make("live-saved"), workspaceRoot: "/workspace/saved" }),
    ];

    expect(
      syncLiveThreadMetadataToLocalState({
        threads: [],
        storedProjects,
        liveProjects,
        liveThreads: [
          {
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
          } as never,
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        id: "thread-child",
        projectId: "stored-project",
        parentThreadId: "thread-parent",
        ticketId: "PROJ-123",
      }),
    ]);
  });

  it("preserves remembered local display mode while syncing live child metadata", () => {
    const storedProjects = [
      makeStoredProject({
        workspace: {
          rootPath: "/workspace/saved",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      }),
    ];
    const liveProjects = [
      makeLiveProject({ id: ProjectId.make("live-saved"), workspaceRoot: "/workspace/saved" }),
    ];

    expect(
      syncLiveThreadMetadataToLocalState({
        threads: [
          makeProjectThread({
            id: "thread-child",
            projectId: "stored-project",
            displayMode: "thread",
          }),
        ],
        storedProjects,
        liveProjects,
        liveThreads: [
          {
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
          } as never,
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        id: "thread-child",
        projectId: "stored-project",
        parentThreadId: "thread-parent",
        ticketId: "PROJ-123",
        displayMode: "thread",
      }),
    ]);
  });

  it("carries a sleeping run's wake instant through to the sidebar pill", () => {
    const projectThread = mapLiveThreadToProjectThread({
      id: "thread-routine",
      projectId: ProjectId.make("live-saved"),
      title: "Weekly triage",
      messages: [],
      activities: [],
      latestTurn: null,
      archivedAt: null,
      error: null,
      session: null,
      createdAt: "2026-06-14T09:00:00.000Z",
      updatedAt: "2026-06-14T10:00:00.000Z",
      sleepingUntil: "2026-06-15T09:00:00.000Z",
      environmentId: "env-local" as EnvironmentId,
      defaultModelSelection: null,
    } as never);

    expect(projectThread.sleepingUntil).toBe("2026-06-15T09:00:00.000Z");

    const pill = resolveThreadStatusPill(projectThread);
    expect(pill?.label).toBe("Sleeping");
    expect(pill?.detail).toMatch(/^until /);
  });

  it("omits sleepingUntil and renders no sleeping pill when no run is clock-parked", () => {
    const projectThread = mapLiveThreadToProjectThread({
      id: "thread-plain",
      projectId: ProjectId.make("live-saved"),
      title: "Active work",
      messages: [],
      activities: [],
      latestTurn: null,
      archivedAt: null,
      error: null,
      session: null,
      createdAt: "2026-06-14T09:00:00.000Z",
      updatedAt: "2026-06-14T10:00:00.000Z",
      environmentId: "env-local" as EnvironmentId,
      defaultModelSelection: null,
    } as never);

    expect(projectThread.sleepingUntil).toBeUndefined();
    expect(resolveThreadStatusPill(projectThread)?.label).not.toBe("Sleeping");
  });
});
