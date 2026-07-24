import { describe, expect, it } from "vite-plus/test";

import { buildProjectTicketLookup } from "~/t3team/t3team-ticketLookup";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";
import {
  buildPinnedTicketThreadFallbacks,
  getSidebarProjectSectionState,
  getSidebarStandaloneButtonClassName,
  getSidebarSurfaceClassName,
  getSidebarThreadState,
  getSidebarTicketState,
  getSidebarWrappedButtonClassName,
} from "./t3team-projectSidebarItemState";

function createThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "PROJ-1 kickoff 1",
    status: "idle",
    lastMessageAt: "2026-05-26T12:00:00.000Z",
    messageCount: 0,
    createdAt: "2026-05-26T12:00:00.000Z",
    ...overrides,
  };
}

function createTicket(overrides: Partial<ProjectTicket> = {}): ProjectTicket {
  return {
    id: overrides.id ?? "ticket-1",
    projectId: overrides.projectId ?? "project-1",
    ref: {
      provider: overrides.ref?.provider ?? "atlassian",
      kind: overrides.ref?.kind ?? "jira-issue",
      id: overrides.ref?.id ?? overrides.id ?? "ticket-1",
      displayId: overrides.ref?.displayId ?? "PROJ-1",
      title: overrides.ref?.title ?? "Ticket",
      url: overrides.ref?.url ?? "",
      projectId: overrides.ref?.projectId ?? "project-1",
    },
    status: overrides.status ?? "Open",
    updatedAt: overrides.updatedAt ?? "2026-05-26T12:00:00.000Z",
    ...overrides,
  };
}

describe("getSidebarTicketState", () => {
  it("keeps the ticket open but not selected when a standalone child thread is active", () => {
    expect(
      getSidebarTicketState({
        view: { type: "thread", projectId: "project-1", threadId: "thread-2" },
        ticketId: "ticket-1",
        ticketThreads: [{ id: "thread-2" }],
      }),
    ).toEqual({ isSelected: false, isOpen: true });
  });

  it("keeps the ticket open but not selected when an embedded child thread is active", () => {
    expect(
      getSidebarTicketState({
        view: {
          type: "ticket",
          projectId: "project-1",
          ticketId: "ticket-1",
          embeddedThreadId: "thread-2",
        },
        ticketId: "ticket-1",
        ticketThreads: [{ id: "thread-2" }],
      }),
    ).toEqual({ isSelected: false, isOpen: true });
  });

  it("selects the ticket detail route even without an embedded thread", () => {
    expect(
      getSidebarTicketState({
        view: { type: "ticket", projectId: "project-1", ticketId: "ticket-1" },
        ticketId: "ticket-1",
        ticketThreads: [],
      }),
    ).toEqual({ isSelected: true, isOpen: true });
  });
});

describe("getSidebarThreadState", () => {
  it("selects embedded child threads inside a ticket detail view", () => {
    expect(
      getSidebarThreadState({
        view: {
          type: "ticket",
          projectId: "project-1",
          ticketId: "ticket-1",
          embeddedThreadId: "thread-2",
        },
        threadId: "thread-2",
      }),
    ).toEqual({ isSelected: true, isOpen: true });
  });

  it("selects standalone thread routes", () => {
    expect(
      getSidebarThreadState({
        view: { type: "thread", projectId: "project-1", threadId: "thread-2" },
        threadId: "thread-2",
      }),
    ).toEqual({ isSelected: true, isOpen: true });
  });
});

describe("getSidebarProjectSectionState", () => {
  it("keeps My work open without selecting it while a ticket detail is active", () => {
    expect(
      getSidebarProjectSectionState({
        activeDashboardMode: "my-work",
        dashboardMode: "my-work",
        projectId: "project-1",
        view: { type: "ticket", projectId: "project-1", ticketId: "ticket-1" },
      }),
    ).toEqual({ isSelected: false, isOpen: true });
  });
});

describe("sidebar item styling", () => {
  it("does not apply wrapper styling for open ancestors", () => {
    expect(getSidebarSurfaceClassName({ isSelected: false, isOpen: true })).toBe("");
  });

  it("uses the original thread hover treatment for unselected rows", () => {
    expect(getSidebarWrappedButtonClassName({ isSelected: false, isOpen: true })).toContain(
      "hover:bg-accent",
    );
    expect(getSidebarStandaloneButtonClassName({ isSelected: false, isOpen: true })).toContain(
      "hover:bg-accent",
    );
  });

  it("uses the original t3code active-thread treatment for selected rows", () => {
    expect(getSidebarWrappedButtonClassName({ isSelected: true, isOpen: true })).toContain(
      "bg-accent/85",
    );
    expect(getSidebarStandaloneButtonClassName({ isSelected: true, isOpen: true })).toContain(
      "bg-accent/85",
    );
  });
});

describe("buildPinnedTicketThreadFallbacks", () => {
  it("keeps the latest ticket thread metadata for unresolved pinned rows", () => {
    const fallbacks = buildPinnedTicketThreadFallbacks([
      createThread({
        id: "thread-older",
        ticketId: "ticket-1",
        ticketDisplayId: "PROJ-1",
        title: "PROJ-1 kickoff 1",
        lastMessageAt: "2026-05-26T10:00:00.000Z",
      }),
      createThread({
        id: "thread-newer",
        ticketId: "ticket-1",
        ticketDisplayId: "PROJ-1",
        title: "PROJ-1 kickoff 2",
        lastMessageAt: "2026-05-26T12:30:00.000Z",
      }),
    ]);

    expect(fallbacks.get("ticket-1")).toEqual(
      expect.objectContaining({
        ticketId: "ticket-1",
        ticketDisplayId: "PROJ-1",
        title: "PROJ-1 kickoff 2",
        ticketThreads: [
          expect.objectContaining({ id: "thread-newer" }),
          expect.objectContaining({ id: "thread-older" }),
        ],
      }),
    );
  });

  it("normalizes display-id thread metadata to the canonical ticket id", () => {
    const ticketLookup = buildProjectTicketLookup([
      createTicket({
        id: "ticket-18425-internal",
        ref: {
          provider: "atlassian",
          kind: "jira-issue",
          id: "ticket-18425-internal",
          displayId: "IES-18425",
          title: "Review feat/ies-18419 form update",
          url: "",
          projectId: "project-1",
        },
      }),
    ]);
    const fallbacks = buildPinnedTicketThreadFallbacks(
      [
        createThread({
          id: "thread-display-id",
          ticketId: "IES-18425",
          ticketDisplayId: "IES-18425",
          title: "IES-18425 kickoff 1",
        }),
      ],
      ticketLookup,
    );

    expect(fallbacks.has("IES-18425")).toBe(false);
    expect(fallbacks.get("ticket-18425-internal")).toEqual(
      expect.objectContaining({
        ticketId: "ticket-18425-internal",
        ticketDisplayId: "IES-18425",
        title: "IES-18425 kickoff 1",
      }),
    );
  });
});
