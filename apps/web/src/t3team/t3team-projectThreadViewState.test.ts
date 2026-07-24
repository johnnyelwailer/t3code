import { describe, expect, it } from "vite-plus/test";

import {
  buildExistingProjectThreadViewState,
  buildProjectThreadViewState,
  isEmbeddedProjectThread,
} from "./t3team-projectThreadViewState";

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
