import { ProjectId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3work/t3work-types";

import {
  mergeFetchedThreadPlacements,
  readMissingThreadPlacementIds,
} from "./t3work-useHydrateThreadPlacements";

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

describe("t3work-useHydrateThreadPlacements", () => {
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
          }),
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
