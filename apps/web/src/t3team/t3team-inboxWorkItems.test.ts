import { describe, expect, it } from "vite-plus/test";

import {
  resolveInboxAttribution,
  selectInboxWorkItems,
} from "./t3team-inboxWorkItems.ts";
import type { ProjectThread, ProjectTicket } from "./t3team-types.ts";

const ticket = (over: Partial<ProjectTicket> & { id: string }): ProjectTicket =>
  ({
    projectId: "project-1",
    status: "In Progress",
    ref: {
      provider: "jira",
      kind: "issue",
      id: over.id,
      displayId: over.id.toUpperCase(),
      title: `Title ${over.id}`,
      url: `https://example.invalid/${over.id}`,
      projectId: "project-1",
    },
    ...over,
  }) as ProjectTicket;

const thread = (over: Partial<ProjectThread> & { id: string }): ProjectThread =>
  ({
    projectId: "project-1",
    title: `Thread ${over.id}`,
    messageCount: 1,
    lastMessageAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    status: "idle",
    ...over,
  }) as ProjectThread;

describe("resolveInboxAttribution", () => {
  const ticketsById = new Map([["t-1", ticket({ id: "t-1" })]]);

  it("returns null for threads with no work item", () => {
    expect(resolveInboxAttribution({ thread: thread({ id: "a" }), ticketsById })).toBeNull();
  });

  it("prefers the ticket record for title and link", () => {
    expect(
      resolveInboxAttribution({ thread: thread({ id: "a", ticketId: "t-1" }), ticketsById }),
    ).toEqual({
      ticketId: "t-1",
      displayId: "T-1",
      title: "Title t-1",
      url: "https://example.invalid/t-1",
    });
  });

  it("falls back to the denormalised display id while tickets load", () => {
    expect(
      resolveInboxAttribution({
        thread: thread({ id: "a", ticketId: "t-9", ticketDisplayId: "PROJ-9" }),
        ticketsById,
      }),
    ).toEqual({ ticketId: "t-9", displayId: "PROJ-9", title: "", url: null });
  });

  it("returns null when neither the ticket nor a display id is known", () => {
    expect(
      resolveInboxAttribution({ thread: thread({ id: "a", ticketId: "t-9" }), ticketsById }),
    ).toBeNull();
  });
});

describe("selectInboxWorkItems", () => {
  const base = {
    threads: [],
    pinnedTicketIds: new Set<string>(),
    viewerAccountId: null,
    threadHasPullRequest: () => false,
  };

  it("includes nothing when a work item is neither assigned nor pinned", () => {
    expect(
      selectInboxWorkItems({ ...base, tickets: [ticket({ id: "t-1", assigneeAccountId: "other" })] }),
    ).toEqual([]);
  });

  it("includes work items assigned to the viewer", () => {
    const rows = selectInboxWorkItems({
      ...base,
      tickets: [ticket({ id: "t-1", assigneeAccountId: "me" })],
      viewerAccountId: "me",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe("assigned");
  });

  it("includes pinned work items and reports pinned even when also assigned", () => {
    const rows = selectInboxWorkItems({
      ...base,
      tickets: [ticket({ id: "t-1", assigneeAccountId: "me" })],
      viewerAccountId: "me",
      pinnedTicketIds: new Set(["t-1"]),
    });
    expect(rows[0]?.reason).toBe("pinned");
  });

  it("orders by latest descendant activity and counts descendant PRs", () => {
    const rows = selectInboxWorkItems({
      ...base,
      tickets: [ticket({ id: "t-1" }), ticket({ id: "t-2" })],
      pinnedTicketIds: new Set(["t-1", "t-2"]),
      threads: [
        thread({ id: "a", ticketId: "t-1", lastMessageAt: "2026-07-01T00:00:00.000Z" }),
        thread({ id: "b", ticketId: "t-2", lastMessageAt: "2026-07-05T00:00:00.000Z" }),
        thread({ id: "c", ticketId: "t-2", lastMessageAt: "2026-07-02T00:00:00.000Z" }),
      ],
      threadHasPullRequest: (threadId) => threadId === "b" || threadId === "c",
    });

    expect(rows.map((row) => row.ticketId)).toEqual(["t-2", "t-1"]);
    expect(rows[0]?.pullRequestCount).toBe(2);
    expect(rows[1]?.pullRequestCount).toBe(0);
  });

  it("keeps work items with no thread activity, sorted last but stable", () => {
    const rows = selectInboxWorkItems({
      ...base,
      tickets: [ticket({ id: "t-b" }), ticket({ id: "t-a" }), ticket({ id: "t-live" })],
      pinnedTicketIds: new Set(["t-a", "t-b", "t-live"]),
      threads: [thread({ id: "x", ticketId: "t-live", lastMessageAt: "2026-07-09T00:00:00.000Z" })],
    });

    expect(rows.map((row) => row.ticketId)).toEqual(["t-live", "t-a", "t-b"]);
  });
});
