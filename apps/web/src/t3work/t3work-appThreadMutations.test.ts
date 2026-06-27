import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/localApi", () => ({
  readLocalApi: () => null,
}));

import {
  createTicketKickoffThread,
  openEmbeddedProjectThread,
} from "~/t3work/t3work-appThreadMutations";
import { useT3WorkPinnedSidebarStore } from "~/t3work/t3work-pinnedSidebarStore";
import { useT3WorkSidebarNavPreferencesStore } from "~/t3work/t3work-sidebarNavPreferencesStore";
import { buildTicketSidebarPinnedItemId } from "~/t3work/t3work-sidebarPinningTypes";
import type { ProjectThread } from "~/t3work/t3work-types";

function createProjectThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: "thread-1",
    projectId: "project-1",
    ticketId: "ticket-9",
    title: "PROJ-9 kickoff 1",
    status: "idle",
    lastMessageAt: "2026-05-26T12:00:00.000Z",
    messageCount: 0,
    createdAt: "2026-05-26T12:00:00.000Z",
    ...overrides,
  };
}

function createDashboardThread(): ProjectThread {
  return {
    id: "thread-1",
    projectId: "project-1",
    dashboardMode: "my-work",
    title: "Project kickoff",
    status: "idle",
    lastMessageAt: "2026-05-26T12:00:00.000Z",
    messageCount: 0,
    createdAt: "2026-05-26T12:00:00.000Z",
  };
}

describe("createTicketKickoffThread", () => {
  beforeEach(() => {
    useT3WorkPinnedSidebarStore.setState({ hydrated: true, items: [] });
    useT3WorkSidebarNavPreferencesStore.setState({
      hydrated: true,
      preferencesByProjectId: {
        "project-1": {
          hiddenItemIds: [
            buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "ticket-9" }),
          ],
          orderedItemIds: [
            buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "ticket-8" }),
          ],
        },
      },
    });
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
    expect(
      useT3WorkSidebarNavPreferencesStore.getState().preferencesByProjectId["project-1"],
    ).toEqual({
      hiddenItemIds: [],
      orderedItemIds: [
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "ticket-9" }),
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "ticket-8" }),
      ],
    });
  });

  it("queues generated ticket context directly on the created kickoff thread", async () => {
    const thread = createProjectThread();
    const addToChatFromRequest = vi.fn(async () => undefined);

    await createTicketKickoffThread({
      addToChatFromRequest,
      backend: {} as never,
      onOpenTicket: vi.fn(),
      store: {
        resolveProjectId: vi.fn(() => "project-1"),
        createThreadForTicket: vi.fn(() => thread),
        allProjects: [
          {
            id: "project-1",
            title: "Project One",
            workspace: { rootPath: "/tmp/project-one" },
          },
        ],
        getTicketsForProject: vi.fn(() => [
          {
            id: "ticket-9",
            status: "In Progress",
            ref: {
              displayId: "PROJ-9",
              title: "Investigate context sync",
              type: "Bug",
            },
          },
        ]),
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

    expect(addToChatFromRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        targetLabel: "PROJ-9 Investigate context sync",
        projectWorkspaceRoot: "/tmp/project-one",
      }),
      { type: "thread", threadId: "thread-1" },
    );
  });
});

describe("openEmbeddedProjectThread", () => {
  it("opens a ticket-backed thread in side-by-side view and remembers embedded mode", () => {
    const updateThreadDisplayMode = vi.fn();
    const selectProject = vi.fn();
    const selectTicket = vi.fn();
    const setView = vi.fn();
    const onOpenDashboard = vi.fn();
    const onOpenTicket = vi.fn();

    openEmbeddedProjectThread({
      onOpenDashboard,
      onOpenTicket,
      projectId: "project-from-route",
      store: {
        resolveProjectId: vi.fn(() => "project-1"),
        getThreadsForProject: vi.fn(() => [createProjectThread()]),
        updateThreadDisplayMode,
        selectProject,
        selectTicket,
        setView,
      } as never,
      threadId: "thread-1",
    });

    expect(updateThreadDisplayMode).toHaveBeenCalledWith("thread-1", "embedded");
    expect(selectTicket).toHaveBeenCalledWith("project-1", "ticket-9");
    expect(setView).toHaveBeenCalledWith({
      type: "ticket",
      projectId: "project-1",
      ticketId: "ticket-9",
      embeddedThreadId: "thread-1",
    });
    expect(onOpenTicket).toHaveBeenCalledWith("project-1", "ticket-9", "thread-1");
    expect(selectProject).not.toHaveBeenCalled();
    expect(onOpenDashboard).not.toHaveBeenCalled();
  });

  it("opens a dashboard-backed thread in side-by-side view and remembers embedded mode", () => {
    const updateThreadDisplayMode = vi.fn();
    const selectProject = vi.fn();
    const selectTicket = vi.fn();
    const setView = vi.fn();
    const onOpenDashboard = vi.fn();
    const onOpenTicket = vi.fn();

    openEmbeddedProjectThread({
      onOpenDashboard,
      onOpenTicket,
      projectId: "project-from-route",
      store: {
        resolveProjectId: vi.fn(() => "project-1"),
        getThreadsForProject: vi.fn(() => [createDashboardThread()]),
        updateThreadDisplayMode,
        selectProject,
        selectTicket,
        setView,
      } as never,
      threadId: "thread-1",
    });

    expect(updateThreadDisplayMode).toHaveBeenCalledWith("thread-1", "embedded");
    expect(selectProject).toHaveBeenCalledWith("project-1");
    expect(setView).toHaveBeenCalledWith({
      type: "dashboard",
      projectId: "project-1",
      embeddedThreadId: "thread-1",
    });
    expect(onOpenDashboard).toHaveBeenCalledWith("project-1", "my-work", "thread-1");
    expect(selectTicket).not.toHaveBeenCalled();
    expect(onOpenTicket).not.toHaveBeenCalled();
  });
});
