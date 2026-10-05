import { describe, expect, it } from "vite-plus/test";
import { ProjectId, ThreadId, type EnvironmentId } from "@t3tools/contracts";

import { resolveProjectThreadsForQuery } from "./t3team-useProjectStoreQueries";
import {
  makeLiveProject,
  makeLiveThreadShell,
  makeProjectThread,
  makeStoredProject,
} from "./t3team-threadBridge.testSupport";

describe("resolveProjectThreadsForQuery", () => {
  it("keeps an ephemeral thread with old placement metadata out of the local workspace sidebar", () => {
    const storedProjects = [makeStoredProject()];
    const repairThread = makeProjectThread({
      id: "run:repair:1",
      projectId: "stored-project",
      parentThreadId: "launch-thread",
      ticketId: "PROJ-123",
      retention: "ephemeral",
      title: "Workflow repair",
    });

    expect(
      resolveProjectThreadsForQuery({
        projectId: "stored-project",
        projects: storedProjects,
        threads: [repairThread],
        liveProjects: [makeLiveProject()],
        liveThreads: [
          {
            id: "run:repair:1",
            projectId: ProjectId.make("live-project"),
            retention: "ephemeral",
          } as never,
        ],
      }),
    ).toEqual([]);
  });

  it("does not show a stored ticket thread again under a loose workspace", () => {
    const storedProjects = [
      makeStoredProject({
        workspace: undefined,
        source: {
          provider: "atlassian",
          externalProjectId: "jira-123",
        },
      }),
    ];
    const localThreads = [
      makeProjectThread({
        id: "thread-1",
        projectId: "stored-project",
        ticketId: "IES-18425",
      }),
    ];
    const liveProjects = [makeLiveProject({ id: ProjectId.make("live-loose") })];
    const liveThreads = [
      {
        id: "thread-1",
        projectId: ProjectId.make("live-loose"),
        title: "IES-18425 kickoff 1",
        messages: [],
        createdAt: "2026-05-22T09:00:00.000Z",
        updatedAt: "2026-05-22T10:00:00.000Z",
        environmentId: "env-local" as EnvironmentId,
        defaultModelSelection: null,
      } as never,
    ];

    expect(
      resolveProjectThreadsForQuery({
        projectId: ProjectId.make("live-loose"),
        projects: storedProjects,
        threads: localThreads,
        liveProjects,
        liveThreads,
      }),
    ).toEqual([]);

    expect(
      resolveProjectThreadsForQuery({
        projectId: "stored-project",
        projects: storedProjects,
        threads: localThreads,
        liveProjects,
        liveThreads,
      }),
    ).toEqual([
      expect.objectContaining({
        id: "thread-1",
        projectId: "stored-project",
        ticketId: "IES-18425",
      }),
    ]);
  });

  it("keeps a live thread's fork facts over its synced local row", () => {
    // The live row is merged over the local one: mapped without facts it would drop the
    // workflow pill and child status the sync already stored.
    const live = makeLiveThreadShell({
      id: ThreadId.make("thread-launch"),
      projectId: ProjectId.make("live-saved"),
    });
    const workflowRunStatus = {
      runId: "run-1",
      status: "sleeping" as const,
      pendingKind: null,
      wakeAt: "2026-05-23T09:00:00.000Z",
      updatedAt: "2026-05-22T10:00:00.000Z",
    };

    const [thread] = resolveProjectThreadsForQuery({
      projectId: "stored-project",
      projects: [makeStoredProject()],
      threads: [
        makeProjectThread({ id: "thread-launch", workflowRunStatus, childStatus: "Stale" }),
      ],
      liveProjects: [
        makeLiveProject({ id: ProjectId.make("live-saved"), workspaceRoot: "/workspace/saved" }),
      ],
      liveThreads: [live],
      factsByThreadId: new Map([
        [
          "thread-launch",
          {
            threadId: live.id,
            updatedAt: "2026-05-22T10:00:00.000Z",
            workflowRunStatus,
            childStatus: "Waiting on the review child",
          },
        ],
      ]),
    });

    expect(thread).toMatchObject({
      id: "thread-launch",
      workflowRunStatus: { status: "sleeping" },
      childStatus: "Waiting on the review child",
    });
  });
});
