import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/localApi", () => ({
  readLocalApi: () => null,
}));

import { createTicketKickoffThread } from "~/t3work/t3work-appThreadMutations";
import { useT3WorkPinnedSidebarStore } from "~/t3work/t3work-pinnedSidebarStore";
import type { ProjectThread } from "~/t3work/t3work-types";

function createProjectThread(): ProjectThread {
  return {
    id: "thread-1",
    projectId: "project-1",
    ticketId: "ticket-9",
    title: "PROJ-9 kickoff 1",
    status: "idle",
    lastMessageAt: "2026-05-26T12:00:00.000Z",
    messageCount: 0,
    createdAt: "2026-05-26T12:00:00.000Z",
  };
}

describe("createTicketKickoffThread", () => {
  beforeEach(() => {
    useT3WorkPinnedSidebarStore.setState({ hydrated: true, items: [] });
  });

  it("pins the work item when a kickoff thread is created", async () => {
    const thread = createProjectThread();
    const createThreadForTicket = vi.fn(() => thread);
    const onOpenTicket = vi.fn();

    await createTicketKickoffThread({
      addToChatFromRequest: vi.fn(),
      backend: null as never,
      onOpenTicket,
      store: {
        resolveProjectId: vi.fn(() => "project-1"),
        createThreadForTicket,
        allProjects: [],
        getTicketsForProject: vi.fn(() => []),
      } as never,
      threadInput: {
        projectId: "project-from-route",
        ticketId: "ticket-9",
        ticketDisplayId: "PROJ-9",
        kickoffMessage: "Investigate the regression",
        kickoffModelSelection: { instanceId: "codex" as any, model: "gpt-5.4" },
        kickoffRuntimeMode: "full-access",
        kickoffInteractionMode: "default",
        selectedToolIds: [],
        kickoffContextAttachments: [],
        githubActivityItems: [],
      },
    });

    expect(createThreadForTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        ticketId: "ticket-9",
      }),
    );
    expect(onOpenTicket).toHaveBeenCalledWith("project-1", "ticket-9", "thread-1");
    expect(useT3WorkPinnedSidebarStore.getState().items).toEqual([
      expect.objectContaining({
        kind: "jira-work-item",
        projectId: "project-1",
        ticketId: "ticket-9",
      }),
    ]);
  });
});
