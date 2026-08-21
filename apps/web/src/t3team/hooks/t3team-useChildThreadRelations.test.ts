import { describe, expect, it } from "vite-plus/test";

import type { ProjectTicket, ProjectThread } from "~/t3team/t3team-types";
import {
  buildAttributionByThreadId,
  buildChildThreadRelations,
  computeChildThreadRelationsSignature,
  createChildThreadRelationsMemo,
} from "./t3team-childThreadRelationsCore";

function createThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: overrides.id ?? "thread-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Thread",
    status: overrides.status ?? "idle",
    messageCount: overrides.messageCount ?? 0,
    lastMessageAt: overrides.lastMessageAt ?? "2026-05-26T12:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-05-26T12:00:00.000Z",
    ...overrides,
  };
}

function createTicket(overrides: Partial<ProjectTicket> & { id: string }): ProjectTicket {
  return {
    projectId: overrides.projectId ?? "project-1",
    ref: {
      provider: "jira",
      kind: "issue",
      id: overrides.id,
      displayId: overrides.ref?.displayId ?? `PROJ-${overrides.id}`,
      title: overrides.ref?.title ?? "A ticket",
      url: overrides.ref?.url ?? `https://jira.example.com/browse/${overrides.id}`,
      projectId: overrides.projectId ?? "project-1",
    },
    status: overrides.status ?? "open",
    ...overrides,
  } as ProjectTicket;
}

describe("buildChildThreadRelations", () => {
  it("marks child threads whose parent is present and counts them on the parent", () => {
    const parent = createThread({ id: "parent-1" });
    const childA = createThread({ id: "child-a", parentThreadId: "parent-1", status: "running" });
    const childB = createThread({ id: "child-b", parentThreadId: "parent-1", status: "idle" });
    const sibling = createThread({ id: "sibling-1" });

    const relations = buildChildThreadRelations([parent, childA, childB, sibling]);

    expect(relations.childThreadIds.has("child-a")).toBe(true);
    expect(relations.childThreadIds.has("child-b")).toBe(true);
    expect(relations.childThreadIds.has("parent-1")).toBe(false);
    expect(relations.childThreadIds.has("sibling-1")).toBe(false);
    expect(relations.subRunCountsByParentId.get("parent-1")).toEqual({ total: 2, running: 1 });
  });

  it("never orphan-hides a thread whose parent is missing or unknown", () => {
    const orphan = createThread({ id: "orphan-1", parentThreadId: "does-not-exist" });

    const relations = buildChildThreadRelations([orphan]);

    expect(relations.childThreadIds.has("orphan-1")).toBe(false);
    expect(relations.subRunCountsByParentId.size).toBe(0);
  });

  it("returns empty relations for threads with no parent/child links", () => {
    const relations = buildChildThreadRelations([createThread({ id: "solo-1" })]);

    expect(relations.childThreadIds.size).toBe(0);
    expect(relations.subRunCountsByParentId.size).toBe(0);
  });
});

describe("createChildThreadRelationsMemo", () => {
  it("returns the SAME relations object across calls whose threads have a fresh array identity but equal content", () => {
    const memo = createChildThreadRelationsMemo();
    const parent = createThread({ id: "parent-1" });
    const child = createThread({ id: "child-a", parentThreadId: "parent-1", status: "running" });
    const emptyTickets: ReadonlyMap<string, ProjectTicket> = new Map();

    // Two arrays, same content, deliberately different identity — this is
    // exactly what useProjectStore() hands out on every render (e.g. on
    // thread selection), even when nothing about the threads changed.
    const first = memo([parent, child], emptyTickets);
    const second = memo([{ ...parent }, { ...child }], emptyTickets);

    expect(second).toBe(first);
  });

  it("returns a NEW result once the thread content actually changes", () => {
    const memo = createChildThreadRelationsMemo();
    const parent = createThread({ id: "parent-1" });
    const runningChild = createThread({
      id: "child-a",
      parentThreadId: "parent-1",
      status: "running",
    });
    const completedChild = createThread({
      id: "child-a",
      parentThreadId: "parent-1",
      status: "completed",
    });
    const emptyTickets: ReadonlyMap<string, ProjectTicket> = new Map();

    const first = memo([parent, runningChild], emptyTickets);
    const second = memo([parent, completedChild], emptyTickets);

    expect(second).not.toBe(first);
    expect(second.relations.subRunCountsByParentId.get("parent-1")).toEqual({
      total: 1,
      running: 0,
    });
  });

  it("returns a NEW result when ticketId changes (attribution field added to signature)", () => {
    const memo = createChildThreadRelationsMemo();
    const thread = createThread({ id: "t1" });
    const threadWithTicket = createThread({ id: "t1", ticketId: "ticket-99" });
    const tickets = new Map([["ticket-99", createTicket({ id: "ticket-99" })]]);

    const first = memo([thread], new Map());
    const second = memo([threadWithTicket], tickets);

    expect(second).not.toBe(first);
    expect(second.attributionByThreadId.get("t1")).not.toBeNull();
  });

  it("returns the SAME result when only tickets map identity changes but thread ticketId is absent", () => {
    const memo = createChildThreadRelationsMemo();
    const thread = createThread({ id: "t1" }); // no ticketId
    const emptyTickets1: ReadonlyMap<string, ProjectTicket> = new Map();
    const emptyTickets2: ReadonlyMap<string, ProjectTicket> = new Map(); // new identity

    const first = memo([thread], emptyTickets1);
    const second = memo([{ ...thread }], emptyTickets2);

    expect(second).toBe(first);
  });
});

describe("buildAttributionByThreadId", () => {
  it("returns the EMPTY_ATTRIBUTION_MAP constant when no thread has a ticketId", () => {
    const threads = [createThread({ id: "t1" }), createThread({ id: "t2" })];
    const result1 = buildAttributionByThreadId(threads, new Map());
    const result2 = buildAttributionByThreadId(threads, new Map());

    // Same constant reference — callers that compare with === get a stable value
    expect(result1).toBe(result2);
    expect(result1.size).toBe(0);
  });

  it("resolves attribution from a ticket when thread.ticketId is present", () => {
    const ticket = createTicket({
      id: "PROJ-1",
      ref: { displayId: "PROJ-42" } as ProjectTicket["ref"],
    });
    const thread = createThread({ id: "t1", ticketId: "PROJ-1" });
    const ticketsById = new Map([["PROJ-1", ticket]]);

    const result = buildAttributionByThreadId([thread], ticketsById);

    expect(result.size).toBe(1);
    const attr = result.get("t1");
    expect(attr).not.toBeNull();
    expect(attr?.displayId).toBe("PROJ-42");
  });

  it("includes an attribution entry (with ticketId fallback) when ticket is missing from map", () => {
    const thread = createThread({ id: "t1", ticketId: "PROJ-99", ticketDisplayId: "PROJ-99" });

    const result = buildAttributionByThreadId([thread], new Map());

    const attr = result.get("t1");
    expect(attr).not.toBeNull();
    expect(attr?.ticketId).toBe("PROJ-99");
  });

  it("only includes entries for threads that have a ticketId", () => {
    const withTicket = createThread({ id: "t1", ticketId: "PROJ-1", ticketDisplayId: "PROJ-1" });
    const withoutTicket = createThread({ id: "t2" });

    const result = buildAttributionByThreadId([withTicket, withoutTicket], new Map());

    expect(result.has("t1")).toBe(true);
    expect(result.has("t2")).toBe(false);
  });
});

describe("computeChildThreadRelationsSignature", () => {
  it("covers ticketId and ticketDisplayId so attribution changes invalidate the cache", () => {
    const base = createThread({ id: "t1" });
    const withTicket = createThread({ id: "t1", ticketId: "X", ticketDisplayId: "X-1" });
    const withDifferentTicket = createThread({ id: "t1", ticketId: "Y", ticketDisplayId: "Y-2" });

    const sig1 = computeChildThreadRelationsSignature([base]);
    const sig2 = computeChildThreadRelationsSignature([withTicket]);
    const sig3 = computeChildThreadRelationsSignature([withDifferentTicket]);

    expect(sig1).not.toBe(sig2);
    expect(sig2).not.toBe(sig3);
  });

  it("is order-independent", () => {
    const a = createThread({ id: "a" });
    const b = createThread({ id: "b", ticketId: "T1" });

    expect(computeChildThreadRelationsSignature([a, b])).toBe(
      computeChildThreadRelationsSignature([b, a]),
    );
  });
});
