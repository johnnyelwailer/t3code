import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { assembleMyWorkDigestProjectData } from "./t3team-myworkDigestAggregation.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { assembleDigestYesterday } from "./t3team-myworkDigestYesterday.ts";
import { digestYesterdayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";

const iso = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));
const windowIn = (nowIso: string, zone: string) => {
  const window = digestYesterdayWindow(Date.parse(nowIso), zone);
  return { from: iso(window.fromMs), until: iso(window.untilMs) };
};

describe("digestYesterdayWindow", () => {
  it("is the day before on a Tuesday, in the viewer's zone", () => {
    // Tue 2026-10-06 09:00 in Zurich (UTC+2): yesterday is Mon 10-05 00:00 .. Tue 10-06 00:00.
    expect(windowIn("2026-10-06T07:00:00Z", "Europe/Zurich")).toEqual({
      from: "2026-10-04T22:00:00.000Z",
      until: "2026-10-05T22:00:00.000Z",
    });
  });

  it("reads 'today' in the viewer's zone, not UTC", () => {
    // 23:30Z on Tue is already Wed 01:30 in Zurich: yesterday is Tuesday.
    expect(windowIn("2026-10-06T23:30:00Z", "Europe/Zurich").from).toBe("2026-10-05T22:00:00.000Z");
  });

  it("is Friday on a Monday, running on to the start of Monday", () => {
    expect(windowIn("2026-10-12T08:00:00Z", "Europe/Zurich")).toEqual({
      from: "2026-10-08T22:00:00.000Z",
      until: "2026-10-11T22:00:00.000Z",
    });
  });

  it("is Friday on a Sunday, and on a Saturday", () => {
    expect(windowIn("2026-10-11T12:00:00Z", "Europe/Zurich").from).toBe("2026-10-08T22:00:00.000Z");
    expect(windowIn("2026-10-10T12:00:00Z", "Europe/Zurich").from).toBe("2026-10-08T22:00:00.000Z");
  });

  it("follows the clock change: Friday starts at +2, Monday at +1", () => {
    // Zurich left summer time on Sun 2026-10-25.
    expect(windowIn("2026-10-26T08:00:00Z", "Europe/Zurich")).toEqual({
      from: "2026-10-22T22:00:00.000Z",
      until: "2026-10-25T23:00:00.000Z",
    });
  });

  it("falls back to the server's own zone for a missing or unknown one", () => {
    const now = Date.parse("2026-10-06T07:00:00Z");
    expect(digestYesterdayWindow(now, "Not/AZone")).toEqual(digestYesterdayWindow(now));
  });
});

const window = {
  fromMs: Date.parse("2026-10-04T22:00:00Z"),
  untilMs: Date.parse("2026-10-05T22:00:00Z"),
};
const ticket = (id: string, status: string, updatedAt: string): BacklogResourceRef =>
  ({
    id,
    displayId: `IES-${id}`,
    title: `Ticket ${id}`,
    status,
    updatedAt,
    url: "u",
    provider: "atlassian",
    kind: "issue",
  }) as BacklogResourceRef;
const move = (id: string, from: string, to: string, at: string) => ({
  ticketRef: { issueId: id, issueKey: `IES-${id}` },
  from,
  to,
  at,
});
const mergedEntry = (number: number, title: string, mergedAt: string) => ({
  host: "github.com",
  repository: "hive/ies-alarm",
  number,
  title,
  headBranch: "",
  state: "merged",
  isDraft: false,
  updatedAt: mergedAt,
  viewerReviewRequested: false,
  viewerAuthored: true,
});

describe("assembleDigestYesterday", () => {
  const base = { window, ticketKeys: new Set(["IES-1", "IES-2"]), mergedEntries: [], assigned: [] };

  it("lists a merged PR with the ticket its title names", () => {
    const result = assembleDigestYesterday({
      ...base,
      mergedEntries: [mergedEntry(7, "IES-1 fix the alarm", "2026-10-05T10:00:00Z")],
      transitions: [],
    });
    expect(result?.merged).toEqual([
      {
        id: "github.com:hive/ies-alarm#7",
        host: "github.com",
        repo: "hive/ies-alarm",
        number: 7,
        title: "IES-1 fix the alarm",
        mergedAt: "2026-10-05T10:00:00Z",
        workItemKey: "IES-1",
      },
    ]);
    expect(result?.from).toBe("2026-10-04T22:00:00.000Z");
    expect(result?.until).toBe("2026-10-05T22:00:00.000Z");
  });

  it("moves a ticket from its first status to its last, newest first", () => {
    const result = assembleDigestYesterday({
      ...base,
      assigned: [
        ticket("1", "Done", "2026-10-06T08:00:00Z"),
        ticket("2", "In Review", "2026-10-05T12:00:00Z"),
      ],
      transitions: [
        move("1", "To Do", "In Progress", "2026-10-05T08:00:00Z"),
        move("1", "In Progress", "Done", "2026-10-05T15:00:00Z"),
        move("2", "In Progress", "In Review", "2026-10-05T16:00:00Z"),
        // Outside the window: not yesterday's.
        move("2", "To Do", "In Progress", "2026-09-20T09:00:00Z"),
      ],
    });
    expect(result?.moved).toEqual([
      {
        ticketRef: { issueId: "2", issueKey: "IES-2" },
        from: "In Progress",
        to: "In Review",
        at: "2026-10-05T16:00:00Z",
      },
      {
        ticketRef: { issueId: "1", issueKey: "IES-1" },
        from: "To Do",
        to: "Done",
        at: "2026-10-05T15:00:00Z",
      },
    ]);
  });

  it("lists a ticket Jira updated in the window without a status move", () => {
    const result = assembleDigestYesterday({
      ...base,
      assigned: [
        ticket("1", "In Progress", "2026-10-05T09:00:00Z"),
        ticket("2", "To Do", "2026-10-03T09:00:00Z"),
      ],
      transitions: [],
    });
    expect(result?.moved).toEqual([
      { ticketRef: { issueId: "1", issueKey: "IES-1" }, at: "2026-10-05T09:00:00Z" },
    ]);
  });

  it("does not call out-and-back a move", () => {
    const result = assembleDigestYesterday({
      ...base,
      assigned: [ticket("1", "To Do", "2026-10-06T08:00:00Z")],
      transitions: [
        move("1", "To Do", "In Progress", "2026-10-05T08:00:00Z"),
        move("1", "In Progress", "To Do", "2026-10-05T09:00:00Z"),
      ],
    });
    expect(result).toBeUndefined();
  });

  it("is absent when nothing happened", () => {
    expect(assembleDigestYesterday({ ...base, transitions: [] })).toBeUndefined();
  });
});

describe("the project payload", () => {
  const source = {
    input: { account: { id: "a", provider: "atlassian" }, externalProjectId: "IES" },
    tickets: [],
    threadTickets: [],
    claims: [],
    decisions: [],
    prEntries: [],
    transitions: [],
    sprints: [],
    nowIso: "2026-10-06T07:00:00.000Z",
  };

  it("carries yesterday when the source has one, and omits it otherwise", () => {
    const yesterday = { from: "f", until: "u", merged: [], moved: [] };
    expect(assembleMyWorkDigestProjectData({ ...source, yesterday }).yesterday).toBe(yesterday);
    expect("yesterday" in assembleMyWorkDigestProjectData(source)).toBe(false);
  });
});
