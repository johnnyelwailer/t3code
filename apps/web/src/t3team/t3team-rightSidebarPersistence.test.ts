import { describe, expect, it } from "vite-plus/test";

import {
  getProjectDashboardRightSidebarCollapsedStorageKey,
  getTicketRightSidebarCollapsedStorageKey,
} from "./t3team-rightSidebarPersistence";

describe("t3team right sidebar persistence", () => {
  it("scopes dashboard collapse state by project, mode, and embedded thread instance", () => {
    expect(
      getProjectDashboardRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        dashboardMode: "backlog",
      }),
    ).toBe("t3team:right-sidebar:dashboard:v1:project-1:backlog:__root__");

    expect(
      getProjectDashboardRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        dashboardMode: "backlog",
        embeddedThreadId: "thread-1",
      }),
    ).not.toBe(
      getProjectDashboardRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        dashboardMode: "backlog",
        embeddedThreadId: "thread-2",
      }),
    );

    expect(
      getProjectDashboardRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        dashboardMode: "backlog",
      }),
    ).not.toBe(
      getProjectDashboardRightSidebarCollapsedStorageKey({
        projectId: "project-1",
        dashboardMode: "my-work",
      }),
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
