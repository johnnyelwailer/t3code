import { ProjectId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import type { Project, ThreadShell } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";

import { makeLiveThreadShell } from "./t3team-threadBridge.testSupport";
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

function makeLiveThread(overrides: Partial<ThreadShell> = {}): ThreadShell {
  return makeLiveThreadShell({
    id: ThreadId.make("thread-child"),
    projectId: ProjectId.make("live-project"),
    ...overrides,
  });
}

function makeProjectThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: "thread-child",
    projectId: "stored-project",
    title: "Investigate regression",
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
          makeLiveThread({ id: ThreadId.make("thread-known") }),
          makeLiveThread({ id: ThreadId.make("thread-missing") }),
        ],
      }),
    ).toEqual(["thread-missing"]);
  });

  it("does not request placements when local state already carries the placement", () => {
    expect(
      readMissingThreadPlacementIds({
        threads: [
          makeProjectThread({
            id: "thread-child",
            parentThreadId: "thread-parent",
            ticketId: "PROJ-123",
          }),
        ],
        liveThreads: [makeLiveThread()],
      }),
    ).toEqual([]);
  });

  it("requests placements for a live thread whose local copy carries no placement", () => {
    // A shell has no activities to carry placement, so a local thread without one is still
    // unresolved and the server route is asked.
    expect(
      readMissingThreadPlacementIds({
        threads: [makeProjectThread({ id: "thread-child" })],
        liveThreads: [makeLiveThread()],
      }),
    ).toEqual(["thread-child"]);
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

  it("ignores placements for threads that are not in the live shell list", () => {
    expect(
      mergeFetchedThreadPlacements({
        threads: [],
        storedProjects: [makeStoredProject()],
        liveProjects: [makeLiveProject()],
        liveThreads: [makeLiveThread()],
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
});
