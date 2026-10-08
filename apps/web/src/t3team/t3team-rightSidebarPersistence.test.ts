import { describe, expect, it } from "vite-plus/test";

import {
  getProjectDashboardRightSidebarCollapsedStorageKey,
  getTicketRightSidebarCollapsedStorageKey,
} from "./t3team-rightSidebarPersistence";

describe("t3team right sidebar persistence", () => {
  it("keeps one dashboard collapse state per project, across modes and threads", () => {
    expect(getProjectDashboardRightSidebarCollapsedStorageKey({ projectId: "project-1" })).toBe(
      "t3team:right-sidebar:dashboard:v2:project-1",
    );
    expect(getProjectDashboardRightSidebarCollapsedStorageKey({ projectId: "project-1" })).not.toBe(
      getProjectDashboardRightSidebarCollapsedStorageKey({ projectId: "project-2" }),
    );
  });

  it("scopes ticket collapse state by ticket and embedded thread instance", () => {
    expect(
      getTicketRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        ticketId: "ticket-1",
      }),
    ).toBe("t3team:right-sidebar:ticket:v1:project-1:ticket-1:__root__");

    expect(
      getTicketRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        ticketId: "ticket-1",
        embeddedThreadId: "thread-1",
      }),
    ).not.toBe(
      getTicketRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        ticketId: "ticket-2",
        embeddedThreadId: "thread-1",
      }),
    );

    expect(
      getTicketRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        ticketId: "ticket-1",
      }),
    ).not.toBe(
      getTicketRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        ticketId: "ticket-1",
        embeddedThreadId: "thread-1",
      }),
    );
  });
});
