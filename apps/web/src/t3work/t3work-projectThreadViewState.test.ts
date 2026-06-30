import { describe, expect, it } from "vite-plus/test";

import {
  buildExistingProjectThreadViewState,
  buildProjectThreadViewState,
  isEmbeddedProjectThread,
  mergeRouteAndStoreView,
} from "./t3work-projectThreadViewState";

describe("buildProjectThreadViewState", () => {
  it("creates a full thread route for standalone project threads", () => {
    expect(
      buildProjectThreadViewState({
        projectId: "project-1",
        threadId: "thread-1",
        displayMode: "thread",
      }),
    ).toEqual({
      type: "thread",
      projectId: "project-1",
      threadId: "thread-1",
    });
  });

  it("creates an embedded dashboard route for dashboard-owned threads", () => {
    expect(
      buildProjectThreadViewState({
        projectId: "project-1",
        threadId: "thread-1",
        dashboardMode: "backlog",
      }),
    ).toEqual({
      type: "dashboard",
      projectId: "project-1",
      embeddedThreadId: "thread-1",
    });
  });

  it("creates an embedded ticket route for ticket threads", () => {
    expect(
      buildProjectThreadViewState({
        projectId: "project-1",
        threadId: "thread-1",
        ticketId: "ticket-1",
      }),
    ).toEqual({
      type: "ticket",
      projectId: "project-1",
      ticketId: "ticket-1",
      embeddedThreadId: "thread-1",
    });
  });
});

describe("buildExistingProjectThreadViewState", () => {
  it("opens ownerless project threads in full thread view", () => {
    expect(
      buildExistingProjectThreadViewState("project-1", {
        id: "thread-1",
      }),
    ).toEqual({
      type: "thread",
      projectId: "project-1",
      threadId: "thread-1",
    });
  });

  it("reopens ticket-backed threads in full thread view when remembered", () => {
    expect(
      buildExistingProjectThreadViewState("project-1", {
        id: "thread-1",
        ticketId: "ticket-1",
        displayMode: "thread",
      }),
    ).toEqual({
      type: "thread",
      projectId: "project-1",
      threadId: "thread-1",
    });
  });
});

describe("isEmbeddedProjectThread", () => {
  it("only treats dashboard or ticket-owned threads as embedded", () => {
    expect(isEmbeddedProjectThread({ dashboardMode: "my-work" })).toBe(true);
    expect(isEmbeddedProjectThread({ ticketId: "ticket-1" })).toBe(true);
    expect(isEmbeddedProjectThread({})).toBe(false);
  });
});

describe("mergeRouteAndStoreView", () => {
  it("falls back to store view when route view is absent", () => {
    const storeView = {
      type: "dashboard" as const,
      projectId: "project-1",
      embeddedThreadId: "thread-1",
    };

    expect(mergeRouteAndStoreView(null, storeView)).toEqual(storeView);
    expect(mergeRouteAndStoreView(undefined, storeView)).toEqual(storeView);
  });

  it("keeps store embeddedThreadId on dashboard routes until URL catches up", () => {
    expect(
      mergeRouteAndStoreView(
        { type: "dashboard", projectId: "project-1" },
        { type: "dashboard", projectId: "project-1", embeddedThreadId: "thread-1" },
      ),
    ).toEqual({
      type: "dashboard",
      projectId: "project-1",
      embeddedThreadId: "thread-1",
    });
  });

  it("keeps store embeddedThreadId on matching ticket routes until URL catches up", () => {
    expect(
      mergeRouteAndStoreView(
        { type: "ticket", projectId: "project-1", ticketId: "ticket-1" },
        {
          type: "ticket",
          projectId: "project-1",
          ticketId: "ticket-1",
          embeddedThreadId: "thread-1",
        },
      ),
    ).toEqual({
      type: "ticket",
      projectId: "project-1",
      ticketId: "ticket-1",
      embeddedThreadId: "thread-1",
    });
  });

  it("prefers route embeddedThreadId when both route and store provide one", () => {
    expect(
      mergeRouteAndStoreView(
        { type: "dashboard", projectId: "project-1", embeddedThreadId: "thread-route" },
        { type: "dashboard", projectId: "project-1", embeddedThreadId: "thread-store" },
      ),
    ).toEqual({
      type: "dashboard",
      projectId: "project-1",
      embeddedThreadId: "thread-route",
    });
  });

  it("does not merge embeddedThreadId across different projects or view types", () => {
    const routeDashboard = { type: "dashboard" as const, projectId: "project-1" };

    expect(
      mergeRouteAndStoreView(routeDashboard, {
        type: "dashboard",
        projectId: "project-2",
        embeddedThreadId: "thread-1",
      }),
    ).toEqual(routeDashboard);

    expect(
      mergeRouteAndStoreView(routeDashboard, {
        type: "ticket",
        projectId: "project-1",
        ticketId: "ticket-1",
        embeddedThreadId: "thread-1",
      }),
    ).toEqual(routeDashboard);
  });
});
