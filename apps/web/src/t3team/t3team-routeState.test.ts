import { describe, expect, it } from "vite-plus/test";

import { parseT3TeamRouteSearch, parseT3TeamViewFromPath } from "~/t3team/t3team-routeState";

describe("t3team route state", () => {
  it("parses an embedded chat thread id from route search", () => {
    expect(parseT3TeamRouteSearch({ chatThreadId: "thread-123" })).toMatchObject({
      chatThreadId: "thread-123",
    });
  });

  it("parses the initial setup welcome flag from route search", () => {
    expect(parseT3TeamRouteSearch({ setup: "welcome" })).toMatchObject({
      setup: "welcome",
    });
    expect(parseT3TeamRouteSearch({ setup: "later" })).not.toHaveProperty("setup");
  });

  it("keeps dashboard routes on the same parent view while carrying the embedded thread", () => {
    expect(
      parseT3TeamViewFromPath("/t3team/projects/acme", {
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
      parseT3TeamViewFromPath("/t3team/projects/acme/tickets/PROJ-7", {
        chatThreadId: "thread-123",
      }),
    ).toEqual({
      type: "ticket",
      projectId: "acme",
      ticketId: "PROJ-7",
      embeddedThreadId: "thread-123",
    });
  });

  it("keeps the parent thread route while opening a child in its right pane", () => {
    expect(
      parseT3TeamViewFromPath("/t3team/projects/acme/threads/thread-123", {
        chatThreadId: "thread-456",
      }),
    ).toEqual({
      type: "thread",
      projectId: "acme",
      threadId: "thread-123",
      embeddedThreadId: "thread-456",
    });
  });
});
