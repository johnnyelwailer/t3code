import { describe, expect, it } from "vite-plus/test";

import {
  embeddedThreadIdFromParentView,
  isEmbeddedThreadParentView,
  mergeEmbeddedThreadIdFromStore,
  viewsMatchForEmbeddedThreadMerge,
} from "./t3work-viewStateMerge";

describe("isEmbeddedThreadParentView", () => {
  it("recognizes dashboard and ticket parent views", () => {
    expect(isEmbeddedThreadParentView({ type: "dashboard", projectId: "project-1" })).toBe(true);
    expect(
      isEmbeddedThreadParentView({
        type: "ticket",
        projectId: "project-1",
        ticketId: "ticket-1",
      }),
    ).toBe(true);
    expect(
      isEmbeddedThreadParentView({
        type: "thread",
        projectId: "project-1",
        threadId: "thread-1",
      }),
    ).toBe(false);
  });
});

describe("viewsMatchForEmbeddedThreadMerge", () => {
  it("matches dashboard views within the same project context", () => {
    expect(
      viewsMatchForEmbeddedThreadMerge(
        { type: "dashboard", projectId: "project-1" },
        { type: "dashboard", projectId: "project-1" },
      ),
    ).toBe(true);
  });

  it("matches ticket views with the same ticket id", () => {
    expect(
      viewsMatchForEmbeddedThreadMerge(
        { type: "ticket", projectId: "project-1", ticketId: "ticket-1" },
        {
          type: "ticket",
          projectId: "project-1",
          ticketId: "ticket-1",
          embeddedThreadId: "thread-1",
        },
      ),
    ).toBe(true);
  });

  it("rejects mismatched view types or ticket ids", () => {
    expect(
      viewsMatchForEmbeddedThreadMerge(
        { type: "dashboard", projectId: "project-1" },
        { type: "ticket", projectId: "project-1", ticketId: "ticket-1" },
      ),
    ).toBe(false);

    expect(
      viewsMatchForEmbeddedThreadMerge(
        { type: "ticket", projectId: "project-1", ticketId: "ticket-1" },
        { type: "ticket", projectId: "project-1", ticketId: "ticket-2" },
      ),
    ).toBe(false);

    expect(
      viewsMatchForEmbeddedThreadMerge(
        { type: "thread", projectId: "project-1", threadId: "thread-1" },
        { type: "dashboard", projectId: "project-1" },
      ),
    ).toBe(false);
  });
});

describe("mergeEmbeddedThreadIdFromStore", () => {
  it("fills missing route embeddedThreadId from the store", () => {
    expect(
      mergeEmbeddedThreadIdFromStore(
        { type: "dashboard", projectId: "project-1" },
        { type: "dashboard", projectId: "project-1", embeddedThreadId: "thread-1" },
      ),
    ).toEqual({
      type: "dashboard",
      projectId: "project-1",
      embeddedThreadId: "thread-1",
    });
  });

  it("prefers the route embeddedThreadId when present", () => {
    expect(
      mergeEmbeddedThreadIdFromStore(
        { type: "dashboard", projectId: "project-1", embeddedThreadId: "thread-route" },
        { type: "dashboard", projectId: "project-1", embeddedThreadId: "thread-store" },
      ),
    ).toEqual({
      type: "dashboard",
      projectId: "project-1",
      embeddedThreadId: "thread-route",
    });
  });
});

describe("embeddedThreadIdFromParentView", () => {
  it("returns embeddedThreadId for matching parent views in the same project", () => {
    expect(
      embeddedThreadIdFromParentView(
        {
          type: "ticket",
          projectId: "project-1",
          ticketId: "ticket-1",
          embeddedThreadId: "thread-1",
        },
        "project-1",
      ),
    ).toBe("thread-1");
  });

  it("returns undefined for other projects or non-parent views", () => {
    expect(
      embeddedThreadIdFromParentView(
        { type: "dashboard", projectId: "project-1", embeddedThreadId: "thread-1" },
        "project-2",
      ),
    ).toBeUndefined();

    expect(
      embeddedThreadIdFromParentView(
        { type: "thread", projectId: "project-1", threadId: "thread-1" },
        "project-1",
      ),
    ).toBeUndefined();
  });
});
