import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import {
  mapLiveThreadToProjectThread,
  mergeProjectThreads,
  normalizeWorkspaceRootPath,
  remapProjectThreadToStoredProject,
  resolveCanonicalProjectId,
  resolveCanonicalProjectIdForWorkspaceRoot,
  resolveStoredProjectId,
  syncLiveThreadMetadataToLocalState,
} from "./t3team-threadBridge";
import {
  makeLiveProject,
  makeLiveThreadShell,
  makeProjectThread,
  makeStoredProject,
} from "./t3team-threadBridge.testSupport";
import { resolveThreadStatusPill } from "~/t3team/components/t3team-projectSidebarShared";

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

  it("carries the live activity state + enrichment onto ProjectThread (GHE #208)", () => {
    const mapped = mapLiveThreadToProjectThread(
      makeLiveThreadShell({
        id: ThreadId.make("thread-activity"),
        projectId: LIVE_SAVED,
        activityLabel: "editing the retry test",
        activityState: "working",
        activityStateUpdatedAt: "2026-05-22T10:00:01.000Z",
      }),
    );
    expect(mapped.activityLabel).toBe("editing the retry test");
    expect(mapped.activityState).toBe("working");
    expect(mapped.activityStateUpdatedAt).toBe("2026-05-22T10:00:01.000Z");
  });

  it("carries the shell's pending-question flag onto ProjectThread (parent-side indicator)", () => {
    const base = makeLiveThreadShell({
      id: ThreadId.make("thread-pending-question"),
      projectId: LIVE_SAVED,
    });
    expect(
      mapLiveThreadToProjectThread({ ...base, hasPendingUserInput: true }).pendingUserInput,
    ).toBe(true);
    expect(
      mapLiveThreadToProjectThread({ ...base, hasPendingUserInput: false }).pendingUserInput,
    ).toBe(false);
    const { hasPendingUserInput: _omitted, ...withoutFlag } = base;
    expect(
      mapLiveThreadToProjectThread(withoutFlag as typeof base).pendingUserInput,
    ).toBeUndefined();
  });

  it("carries the plan-mode awaiting-parent fact onto ProjectThread (same predicate as the children tool)", () => {
    const base = makeLiveThreadShell({
      id: ThreadId.make("thread-plan-child"),
      projectId: LIVE_SAVED,
      interactionMode: "plan",
      latestTurn: {
        turnId: "turn-1",
        state: "completed",
        requestedAt: "2026-05-22T09:00:01.000Z",
        startedAt: "2026-05-22T09:00:02.000Z",
        completedAt: "2026-05-22T09:30:00.000Z",
        assistantMessageId: null,
      } as never,
      // The shell's actionable-plan flag replaces the detail's `proposedPlans` scan.
      hasActionableProposedPlan: true,
    });
    // The plan-mode child that presented its plan and stopped…
    expect(mapLiveThreadToProjectThread(base).awaitingParent).toBe(true);
    // …reads plain completed once the approval-implementation turn consumes the plan.
    expect(
      mapLiveThreadToProjectThread({ ...base, hasActionableProposedPlan: false }).awaitingParent,
    ).toBeUndefined();
    // Default-mode threads never flag.
    expect(
      mapLiveThreadToProjectThread({ ...base, interactionMode: "default" }).awaitingParent,
    ).toBeUndefined();
  });

  describe("thread status: error is current state, not history", () => {
    const baseThread = (session: unknown) =>
      makeLiveThreadShell({
        id: ThreadId.make("thread-status"),
        projectId: LIVE_SAVED,
        title: "Child that hit a transient gateway error",
        session: session as never,
      });

    it("keeps red only while the session is CURRENTLY in error state", () => {
      expect(
        mapLiveThreadToProjectThread(baseThread({ status: "error", lastError: "gateway 413" }))
          .status,
      ).toBe("error");
      // lastError without an error session state is banner text, not a state.
      expect(
        mapLiveThreadToProjectThread(baseThread({ status: "error", lastError: null })).status,
      ).toBe("error");
    });

    it("a lingering lastError no longer paints an idle/ready thread red forever", () => {
      expect(
        mapLiveThreadToProjectThread(baseThread({ status: "ready", lastError: "gateway 413" }))
          .status,
      ).toBe("idle");
      expect(
        mapLiveThreadToProjectThread(baseThread({ status: "stopped", lastError: "gateway 413" }))
          .status,
      ).toBe("completed");
      expect(
        mapLiveThreadToProjectThread(baseThread({ status: "running", lastError: "gateway 413" }))
          .status,
      ).toBe("running");
    });
  });

  it("maps the mirrored local session instance from the shell field, not from message ids", () => {
    const shell = makeLiveThreadShell({
      id: ThreadId.make("thread-local-session"),
      projectId: LIVE_SAVED,
      localSessionInstanceId: ProviderInstanceId.make("codex"),
    });
    expect(mapLiveThreadToProjectThread(shell).providerKind).toBe("codex");
    // App-managed threads carry no instance id: no provider mark.
    expect(
      mapLiveThreadToProjectThread(makeLiveThreadShell({ projectId: LIVE_SAVED })).providerKind,
    ).toBeUndefined();
  });

  it("maps the declared wait from the shell's hasOpenChildWait flag", () => {
    const base = makeLiveThreadShell({ projectId: LIVE_SAVED });
    expect(mapLiveThreadToProjectThread({ ...base, hasOpenChildWait: true }).waitingDeclared).toBe(
      true,
    );
    expect(
      mapLiveThreadToProjectThread({ ...base, hasOpenChildWait: false }).waitingDeclared,
    ).toBeUndefined();
    expect(mapLiveThreadToProjectThread(base).waitingDeclared).toBeUndefined();
  });

  it("derives no parent/ticket placement from a shell (placement comes from the server route)", () => {
    const mapped = mapLiveThreadToProjectThread(
      makeLiveThreadShell({ id: ThreadId.make("thread-child"), projectId: LIVE_SAVED }),
    );
    expect(mapped.parentThreadId).toBeUndefined();
    expect(mapped.ticketId).toBeUndefined();
    expect(mapped).not.toHaveProperty("retention");
    expect(mapped).not.toHaveProperty("messageCount");
  });

  it("keeps durable parent and ticket metadata already in local state when a shell syncs", () => {
    const { storedProjects, liveProjects } = savedWorkspace();

    expect(
      syncLiveThreadMetadataToLocalState({
        threads: [
          makeProjectThread({
            id: "thread-child",
            projectId: "stored-project",
            parentThreadId: "thread-parent",
            ticketId: "PROJ-123",
          }),
        ],
        storedProjects,
        liveProjects,
        liveThreads: [
          makeLiveThreadShell({ id: ThreadId.make("thread-child"), projectId: LIVE_SAVED }),
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

  it("shadows a live shell with no local placement as a root thread", () => {
    const { storedProjects, liveProjects } = savedWorkspace();
    const out = syncLiveThreadMetadataToLocalState({
      threads: [],
      storedProjects,
      liveProjects,
      liveThreads: [
        makeLiveThreadShell({ id: ThreadId.make("thread-child"), projectId: LIVE_SAVED }),
      ],
    });
    expect(out).toEqual([
      expect.objectContaining({ id: "thread-child", projectId: "stored-project" }),
    ]);
    expect(out[0]?.parentThreadId).toBeUndefined();
  });

  it("marks a settled parent as waiting while its t3team child is live", () => {
    const { storedProjects, liveProjects } = savedWorkspace();
    const out = syncLiveThreadMetadataToLocalState({
      // The parent/child relation is the placement persisted in local state.
      threads: [
        makeProjectThread({ id: "thread-parent", projectId: "stored-project" }),
        makeProjectThread({
          id: "thread-child",
          projectId: "stored-project",
          parentThreadId: "thread-parent",
        }),
      ],
      storedProjects,
      liveProjects,
      liveThreads: [
        makeLiveThreadShell({
          id: ThreadId.make("thread-parent"),
          projectId: LIVE_SAVED,
          title: "Parent thread",
          latestTurn: { state: "completed" } as never,
          session: { status: "idle" } as never,
        }),
        makeLiveThreadShell({
          id: ThreadId.make("thread-child"),
          projectId: LIVE_SAVED,
          latestTurn: { state: "running" } as never,
          session: { status: "running" } as never,
        }),
      ],
    });
    const parent = out.find((thread) => thread.id === "thread-parent");
    const child = out.find((thread) => thread.id === "thread-child");
    expect(parent?.waitingOnChildren).toBe(true);
    expect(child?.waitingOnChildren).toBe(false);
  });

  it("does not mark a parent as waiting when local state has no placement for the child", () => {
    const { storedProjects, liveProjects } = savedWorkspace();
    const out = syncLiveThreadMetadataToLocalState({
      threads: [],
      storedProjects,
      liveProjects,
      liveThreads: [
        makeLiveThreadShell({
          id: ThreadId.make("thread-parent"),
          projectId: LIVE_SAVED,
          latestTurn: { state: "completed" } as never,
          session: { status: "idle" } as never,
        }),
        makeLiveThreadShell({
          id: ThreadId.make("thread-child"),
          projectId: LIVE_SAVED,
          latestTurn: { state: "running" } as never,
          session: { status: "running" } as never,
        }),
      ],
    });
    expect(out.find((thread) => thread.id === "thread-parent")?.waitingOnChildren).toBe(false);
  });

  it("clears the waiting fact once the child's run state settles", () => {
    const { storedProjects, liveProjects } = savedWorkspace();
    const out = syncLiveThreadMetadataToLocalState({
      threads: [
        makeProjectThread({ id: "thread-parent", projectId: "stored-project" }),
        makeProjectThread({
          id: "thread-child",
          projectId: "stored-project",
          parentThreadId: "thread-parent",
        }),
      ],
      storedProjects,
      liveProjects,
      liveThreads: [
        makeLiveThreadShell({
          id: ThreadId.make("thread-parent"),
          projectId: LIVE_SAVED,
          latestTurn: { state: "completed" } as never,
          session: { status: "idle" } as never,
        }),
        makeLiveThreadShell({
          id: ThreadId.make("thread-child"),
          projectId: LIVE_SAVED,
          latestTurn: { state: "completed" } as never,
          session: { status: "idle" } as never,
        }),
      ],
    });
    const parent = out.find((thread) => thread.id === "thread-parent");
    expect(parent?.waitingOnChildren).toBe(false);
  });

  it("preserves remembered local display mode while syncing live child metadata", () => {
    const { storedProjects, liveProjects } = savedWorkspace();

    expect(
      syncLiveThreadMetadataToLocalState({
        threads: [
          makeProjectThread({
            id: "thread-child",
            projectId: "stored-project",
            parentThreadId: "thread-parent",
            ticketId: "PROJ-123",
            displayMode: "thread",
          }),
        ],
        storedProjects,
        liveProjects,
        liveThreads: [
          makeLiveThreadShell({ id: ThreadId.make("thread-child"), projectId: LIVE_SAVED }),
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
    const projectThread = mapLiveThreadToProjectThread(
      makeLiveThreadShell({
        id: ThreadId.make("thread-routine"),
        projectId: LIVE_SAVED,
        title: "Weekly triage",
        sleepingUntil: "2026-06-15T09:00:00.000Z",
      }),
    );

    expect(projectThread.sleepingUntil).toBe("2026-06-15T09:00:00.000Z");

    const pill = resolveThreadStatusPill(projectThread);
    expect(pill?.label).toBe("Sleeping");
    expect(pill?.detail).toBe("Due now");
  });

  it("omits sleepingUntil and renders no sleeping pill when no run is clock-parked", () => {
    const projectThread = mapLiveThreadToProjectThread(
      makeLiveThreadShell({
        id: ThreadId.make("thread-plain"),
        projectId: LIVE_SAVED,
        title: "Active work",
      }),
    );

    expect(projectThread.sleepingUntil).toBeUndefined();
    expect(resolveThreadStatusPill(projectThread)?.label).not.toBe("Sleeping");
  });
});
