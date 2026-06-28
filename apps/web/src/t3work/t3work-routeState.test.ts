import { describe, expect, it } from "vite-plus/test";

import { parseT3workRouteSearch, parseT3workViewFromPath } from "~/t3work/t3work-routeState";

describe("t3work route state", () => {
  it("parses an embedded chat thread id from route search", () => {
    expect(parseT3workRouteSearch({ chatThreadId: "thread-123" })).toMatchObject({
      chatThreadId: "thread-123",
    });
  });

  it("parses the initial setup welcome flag from route search", () => {
    expect(parseT3workRouteSearch({ setup: "welcome" })).toMatchObject({
      setup: "welcome",
    });
    expect(parseT3workRouteSearch({ setup: "later" })).not.toHaveProperty("setup");
  });

  it("keeps dashboard routes on the same parent view while carrying the embedded thread", () => {
    expect(
      parseT3workViewFromPath("/t3work/projects/acme", {
        chatThreadId: "thread-123",
      }),
    ).toEqual({
      type: "dashboard",
      projectId: "acme",
      embeddedThreadId: "thread-123",
    });
  });

  it("keeps ticket routes on the same parent view while carrying the embedded thread", () => {
    expect(
      parseT3workViewFromPath("/t3work/projects/acme/tickets/PROJ-7", {
        chatThreadId: "thread-123",
      }),
    ).toEqual({
      type: "ticket",
      projectId: "acme",
      ticketId: "PROJ-7",
      embeddedThreadId: "thread-123",
    });
  });

  it("leaves standalone thread routes unchanged", () => {
    expect(
      parseT3workViewFromPath("/t3work/projects/acme/threads/thread-123", {
        chatThreadId: "thread-456",
      }),
    ).toEqual({
      type: "thread",
      projectId: "acme",
      threadId: "thread-123",
    });
  });

  it("parses the recipe manager page route with an embedded chat thread", () => {
    expect(
      parseT3workViewFromPath("/t3work/projects/acme/recipes", {
        chatThreadId: "thread-123",
      }),
    ).toEqual({
      type: "recipes",
      projectId: "acme",
      embeddedThreadId: "thread-123",
    });
  });
});
