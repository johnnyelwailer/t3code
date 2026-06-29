import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectTicket } from "~/t3work/t3work-types";

import { drainWorkItemContextSyncQueueOnce } from "./t3work-useWorkItemContextSyncQueue";

function createTicket(key: string): ProjectTicket {
  return {
    id: key.toLowerCase(),
    projectId: "Project Alpha",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title: `Ticket ${key}`,
      type: "Task",
      url: `https://example.test/browse/${key}`,
      projectId: "PROJ",
    },
    issueType: "Task",
    status: "In Progress",
    updatedAt: "2026-05-18T12:00:00.000Z",
  };
}

describe("drainWorkItemContextSyncQueueOnce", () => {
  it("leaves queued sync incomplete until delayed project tickets are available", async () => {
    let projectTickets: ReadonlyArray<ProjectTicket> = [];
    const ensureFullWorkItemContextBundle = vi.fn(async () => undefined);
    const queuedRequests = [
      {
        id: "sync-proj-1",
        projectId: "Project Alpha",
        ticketKey: "PROJ-1",
      },
    ];

    const firstCompleted = await drainWorkItemContextSyncQueueOnce({
      queuedRequests,
      completedRequestIds: new Set(),
      readProjectTickets: () => projectTickets,
      ensureFullWorkItemContextBundle,
    });

    expect(firstCompleted.has("sync-proj-1")).toBe(false);
    expect(ensureFullWorkItemContextBundle).not.toHaveBeenCalled();

    const ticket = createTicket("PROJ-1");
    projectTickets = [ticket];

    const secondCompleted = await drainWorkItemContextSyncQueueOnce({
      queuedRequests,
      completedRequestIds: firstCompleted,
      readProjectTickets: () => projectTickets,
      ensureFullWorkItemContextBundle,
    });

    expect(secondCompleted.has("sync-proj-1")).toBe(true);
    expect(ensureFullWorkItemContextBundle).toHaveBeenCalledTimes(1);
    expect(ensureFullWorkItemContextBundle).toHaveBeenCalledWith({
      projectId: "Project Alpha",
      ticket,
    });
  });
});
