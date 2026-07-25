import { describe, expect, it } from "vite-plus/test";

import { buildProjectTicketLookup } from "~/t3team/t3team-ticketLookup";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";
import { buildProjectSidebarThreadGroups } from "./t3team-projectSidebarThreadGroups";

function makeThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: overrides.id ?? "thread-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Thread",
    status: overrides.status ?? "idle",
    messageCount: overrides.messageCount ?? 0,
    lastMessageAt: overrides.lastMessageAt ?? "2026-05-22T10:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-05-22T10:00:00.000Z",
    ...overrides,
  };
}

function makeTicket(overrides: Partial<ProjectTicket> = {}): ProjectTicket {
  return {
    id: overrides.id ?? "ticket-1-internal",
    projectId: overrides.projectId ?? "project-1",
    ref: {
      provider: overrides.ref?.provider ?? "atlassian",
      kind: overrides.ref?.kind ?? "jira-issue",
      id: overrides.ref?.id ?? overrides.id ?? "ticket-1-internal",
      displayId: overrides.ref?.displayId ?? "TICKET-1",
      title: overrides.ref?.title ?? "Ticket",
      url: overrides.ref?.url ?? "",
      projectId: overrides.ref?.projectId ?? "project-1",
    },
    status: overrides.status ?? "Open",
    updatedAt: overrides.updatedAt ?? "2026-05-22T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildProjectSidebarThreadGroups", () => {
  it("partitions project, dashboard, and ticket-owned threads", () => {
    const projectThread = makeThread({ id: "project-thread" });
    const backlogThread = makeThread({ id: "backlog-thread", dashboardMode: "backlog" });
    const myWorkThread = makeThread({ id: "my-work-thread", dashboardMode: "my-work" });
    const ticketThread = makeThread({ id: "ticket-thread", ticketId: "ticket-1" });

    const groups = buildProjectSidebarThreadGroups([
      projectThread,
      backlogThread,
      myWorkThread,
      ticketThread,
    ]);

    expect(groups.projectLevelThreads).toEqual([projectThread]);
    expect(groups.dashboardThreadsByMode.backlog).toEqual([backlogThread]);
    expect(groups.dashboardThreadsByMode["my-work"]).toEqual([myWorkThread]);
    expect(groups.ticketThreadsById.get("ticket-1")).toEqual([ticketThread]);
  });

  it("promotes threads for hidden tickets into the project root bucket", () => {
    const projectThread = makeThread({ id: "project-thread" });
    const visibleTicketThread = makeThread({ id: "visible-ticket-thread", ticketId: "ticket-1" });
    const hiddenTicketThread = makeThread({ id: "hidden-ticket-thread", ticketId: "ticket-2" });

    const groups = buildProjectSidebarThreadGroups(
      [projectThread, visibleTicketThread, hiddenTicketThread],
      { visibleTicketIds: new Set(["ticket-1"]) },
    );

    expect(groups.projectLevelThreads).toEqual([projectThread, hiddenTicketThread]);
    expect(groups.ticketThreadsById.get("ticket-1")).toEqual([visibleTicketThread]);
    expect(groups.ticketThreadsById.has("ticket-2")).toBe(false);
  });

  it("groups display-id thread metadata under the canonical ticket id", () => {
    const aliasThread = makeThread({ id: "thread-display-id", ticketId: "IES-18425" });
    const ticketLookup = buildProjectTicketLookup([
      makeTicket({
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

    const groups = buildProjectSidebarThreadGroups([aliasThread], {
      visibleTicketIds: new Set(["ticket-18425-internal"]),
      ticketLookup,
    });

    expect(groups.projectLevelThreads).toEqual([]);
    expect(groups.ticketThreadsById.get("ticket-18425-internal")).toEqual([aliasThread]);
  });
});
