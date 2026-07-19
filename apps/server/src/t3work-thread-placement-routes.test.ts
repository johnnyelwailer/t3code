import { describe, expect, it } from "vite-plus/test";

import { resolveT3workThreadPlacement } from "./t3work-thread-placement-routes.ts";

function makeToolContext(ticketId?: string) {
  return {
    surface: "t3work",
    tools: [],
    state: {
      view: {
        kind: "thread",
        ...(ticketId ? { ticketId } : {}),
      },
    },
  };
}

describe("resolveT3workThreadPlacement", () => {
  it("returns durable handoff placement when present", () => {
    expect(
      resolveT3workThreadPlacement({
        threadId: "thread-child",
        row: {
          parentThreadId: "thread-parent",
          ticketId: "PROJ-123",
        },
        toolContext: makeToolContext("PROJ-999"),
      }),
    ).toEqual({
      threadId: "thread-child",
      parentThreadId: "thread-parent",
      ticketId: "PROJ-123",
    });
  });

  it("does not return an old placement row for an ephemeral thread", () => {
    expect(
      resolveT3workThreadPlacement({
        threadId: "run:repair:1",
        retention: "ephemeral",
        row: {
          parentThreadId: "launch-thread",
          ticketId: "PROJ-123",
        },
        toolContext: makeToolContext("PROJ-999"),
      }),
    ).toBeNull();
  });

  it("falls back to synced tool-context ticket placement when there is no handoff row", () => {
    expect(
      resolveT3workThreadPlacement({
        threadId: "thread-ticket",
        row: null,
        toolContext: makeToolContext("PROJ-456"),
      }),
    ).toEqual({
      threadId: "thread-ticket",
      ticketId: "PROJ-456",
    });
  });

  it("merges a durable parent thread with tool-context ticket placement", () => {
    expect(
      resolveT3workThreadPlacement({
        threadId: "thread-child",
        row: {
          parentThreadId: "thread-parent",
          ticketId: null,
        },
        toolContext: makeToolContext("PROJ-789"),
      }),
    ).toEqual({
      threadId: "thread-child",
      parentThreadId: "thread-parent",
      ticketId: "PROJ-789",
    });
  });

  it("returns null when neither durable nor synced placement exists", () => {
    expect(
      resolveT3workThreadPlacement({
        threadId: "thread-root",
        row: null,
        toolContext: makeToolContext(),
      }),
    ).toBeNull();
  });
});
