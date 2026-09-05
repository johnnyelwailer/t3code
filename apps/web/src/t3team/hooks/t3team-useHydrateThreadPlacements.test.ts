import { ProjectId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";

import {
  filterUnresolvedThreadPlacementIds,
  mergeFetchedThreadPlacements,
  readMissingThreadPlacementIds,
} from "./t3team-useHydrateThreadPlacements";

describe("filterUnresolvedThreadPlacementIds (GHE #382)", () => {
  const liveThreads = [
    { id: ThreadId.make("a"), updatedAt: "2026-09-01T00:00:00.000Z" },
    { id: ThreadId.make("b"), updatedAt: "2026-09-01T00:00:05.000Z" },
  ];

  it("passes everything through when nothing has been answered yet", () => {
    expect(
      filterUnresolvedThreadPlacementIds({
        threadIds: ["a", "b"],
        liveThreads,
        resolvedEmpty: new Map(),
      }),
    ).toEqual(["a", "b"]);
  });

  it("drops ids whose empty answer matches the thread's current updatedAt", () => {
    expect(
      filterUnresolvedThreadPlacementIds({
        threadIds: ["a", "b"],
        liveThreads,
        resolvedEmpty: new Map([["a", "2026-09-01T00:00:00.000Z"]]),
      }),
    ).toEqual(["b"]);
  });

  it("re-requests an id once the thread has been updated since the empty answer", () => {
    expect(
      filterUnresolvedThreadPlacementIds({
        threadIds: ["a", "b"],
        liveThreads,
        resolvedEmpty: new Map([["b", "2026-09-01T00:00:01.000Z"]]),
      }),
    ).toEqual(["a", "b"]);
  });
});

function makeLiveProject(overrides: Partial<Project> = {}): Project {
  return {
    id: ProjectId.make("live-project"),
    environmentId: "env-local" as EnvironmentId,
    title: "Live project",
    workspaceRoot: "/workspace/saved",
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    scripts: [],
    ...overrides,
  };
}

function makeStoredProject(overrides: Record<string, unknown> = {}): ProjectShellProject {
  return {
    id: "stored-project",
    title: "Stored project",
    source: {
      provider: "local",
      raw: {},
    },
    workspace: {
      rootPath: "/workspace/saved",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    resources: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  } as unknown as ProjectShellProject;
}

function makeLiveThread(overrides: Record<string, unknown> = {}): Thread {
  return {
    id: "thread-child",
    environmentId: "env-local" as EnvironmentId,
    codexThreadId: null,
    projectId: ProjectId.make("live-project"),
    title: "Investigate regression",
    modelSelection: {
      instanceId: "codex",
      model: "gpt-5-codex",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-05-22T09:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-05-22T10:00:00.000Z",
    latestTurn: null,
    pendingSourceProposedPlan: undefined,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  } as unknown as Thread;
}

function makeProjectThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: "thread-child",
    projectId: "stored-project",
    title: "Investigate regression",
    messageCount: 0,
    lastMessageAt: "2026-05-22T10:00:00.000Z",
    createdAt: "2026-05-22T09:00:00.000Z",
    status: "idle",
    ...overrides,
  };
}

describe("t3team-useHydrateThreadPlacements", () => {
  it("requests placements only for live threads missing local metadata", () => {
    expect(
      readMissingThreadPlacementIds({
        threads: [makeProjectThread({ id: "thread-known", ticketId: "PROJ-1" })],
        liveThreads: [
          makeLiveThread({ id: "thread-known" }),
          makeLiveThread({ id: "thread-missing" }),
        ],
      }),
    ).toEqual(["thread-missing"]);
  });

  it("does not request placements when live activities already carry handoff metadata", () => {
    expect(
      readMissingThreadPlacementIds({
        threads: [],
        liveThreads: [
          makeLiveThread({
            activities: [
              {
                id: "activity-handoff-1",
                tone: "info",
                kind: "t3team.handoff.created",
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
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("does not merge an old placement row for an ephemeral repair child after reload", () => {
    expect(
      mergeFetchedThreadPlacements({
        threads: [],
        storedProjects: [makeStoredProject()],
        liveProjects: [makeLiveProject()],
        liveThreads: [makeLiveThread({ id: "run:repair:1", retention: "ephemeral" })],
        placements: [
          {
            threadId: ThreadId.make("run:repair:1"),
            parentThreadId: ThreadId.make("launch-thread"),
            ticketId: "PROJ-123",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("hydrates fetched placements into local shadow threads", () => {
    expect(
      mergeFetchedThreadPlacements({
        threads: [],
        storedProjects: [makeStoredProject()],
        liveProjects: [makeLiveProject()],
        liveThreads: [makeLiveThread()],
        placements: [
          {
            threadId: ThreadId.make("thread-child"),
            parentThreadId: ThreadId.make("thread-parent"),
            ticketId: "PROJ-123",
          },
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
});
