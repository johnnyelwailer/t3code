import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { assembleMyWorkDigestProjectData } from "./t3team-myworkDigestAggregation.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { DIGEST_TRANSITION_RETENTION_MS } from "./t3team-digestStatusTransitions.ts";
import { assembleDigestYesterday } from "./t3team-myworkDigestYesterday.ts";
import { digestDataWindow, lastActivityDayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";

const iso = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

/** The window `lastActivityDayWindow` finds for a lone activity instant, as ISO strings. */
const dayOf = (nowMs: number, zone: string, ms: number) => {
  const window = lastActivityDayWindow(nowMs, zone, [ms]);
  return window !== undefined
    ? { from: iso(window.fromMs), until: iso(window.untilMs) }
    : undefined;
};

describe("digestDataWindow", () => {
  it("runs from the start of today back over the retention", () => {
    // Tue 2026-10-06 09:00 in Zurich (UTC+2, still summer time): today starts Monday 22:00Z.
    const window = digestDataWindow(Date.parse("2026-10-06T07:00:00Z"), "Europe/Zurich");
    expect(window.untilMs).toBe(Date.parse("2026-10-05T22:00:00.000Z"));
    expect(window.fromMs).toBe(window.untilMs - DIGEST_TRANSITION_RETENTION_MS);
  });
});

describe("lastActivityDayWindow", () => {
  // Zurich dates, 2026: 10-04 Sun, 10-05 Mon, 10-06 Tue, 10-08 Thu, 10-09 Fri, 10-11 Sun, 10-12 Mon.
  const NOW = Date.parse("2026-10-12T08:00:00Z"); // a Monday morning
  const atOn = (dateIso: string, hourUtc: number) =>
    Date.parse(`${dateIso}T${String(hourUtc).padStart(2, "0")}:00:00Z`);

  it("is the day before when the day before has activity", () => {
    expect(dayOf(NOW, "Europe/Zurich", atOn("2026-10-11", 12))).toEqual({
      from: "2026-10-10T22:00:00.000Z", // Sunday 00:00 in Zurich
      until: "2026-10-11T22:00:00.000Z",
    });
  });

  it("walks back over empty days to the last active one", () => {
    // Monday, with an empty Sunday and Friday, and a Thursday activity: Thursday wins.
    expect(dayOf(NOW, "Europe/Zurich", atOn("2026-10-08", 10))).toEqual({
      from: "2026-10-07T22:00:00.000Z",
      until: "2026-10-08T22:00:00.000Z",
    });
  });

  it("prefers the newest active day", () => {
    const window = lastActivityDayWindow(NOW, "Europe/Zurich", [
      atOn("2026-10-08", 10),
      atOn("2026-10-09", 16),
    ]);
    expect(window?.fromMs).toBe(Date.parse("2026-10-08T22:00:00.000Z")); // Friday
  });

  it("finds a day three weeks back", () => {
    const window = lastActivityDayWindow(NOW, "Europe/Zurich", [atOn("2026-09-20", 9)]); // Sunday
    expect(window?.fromMs).toBe(Date.parse("2026-09-19T22:00:00.000Z"));
  });

  it("is absent when nothing happened", () => {
    expect(lastActivityDayWindow(NOW, "Europe/Zurich", [])).toBeUndefined();
  });

  it("never counts today", () => {
    expect(lastActivityDayWindow(NOW, "Europe/Zurich", [atOn("2026-10-12", 7)])).toBeUndefined();
  });

  it("reads the day in the viewer's zone, not UTC", () => {
    // 23:30Z on Monday is already Tuesday 01:30 in Zurich: a Monday activity is the day before.
    const now = Date.parse("2026-10-06T23:30:00Z");
    const window = lastActivityDayWindow(now, "Europe/Zurich", [
      Date.parse("2026-10-05T10:00:00Z"),
    ]);
    expect(window?.fromMs).toBe(Date.parse("2026-10-04T22:00:00.000Z")); // Monday 00:00, in Zurich
  });

  it("gives up at the horizon", () => {
    const old = NOW - 2 * DIGEST_TRANSITION_RETENTION_MS;
    expect(lastActivityDayWindow(NOW, "Europe/Zurich", [old])).toBeUndefined();
  });

  it("follows the clock change: the long Sunday runs 25 hours", () => {
    // Zurich leaves summer time on Sun 2026-10-25; a Sunday activity seen on Monday 2026-10-26.
    const window = lastActivityDayWindow(Date.parse("2026-10-26T08:00:00Z"), "Europe/Zurich", [
      Date.parse("2026-10-25T12:00:00Z"),
    ]);
    expect(window).toEqual({
      fromMs: Date.parse("2026-10-24T22:00:00.000Z"), // Sunday still starts at +2
      untilMs: Date.parse("2026-10-25T23:00:00.000Z"), // Monday already starts at +1
    });
  });

  it("falls back to the server's own zone for a missing or unknown one", () => {
    const activity = Date.parse("2026-10-09T12:00:00Z");
    expect(lastActivityDayWindow(NOW, "Not/AZone", [activity])).toEqual(
      lastActivityDayWindow(NOW, undefined, [activity]),
    );
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
