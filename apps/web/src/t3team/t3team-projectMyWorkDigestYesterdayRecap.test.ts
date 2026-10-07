import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import type { DigestYesterday, DigestYesterdayMerged } from "./t3team-projectMyWorkDigestTypes";
import {
  digestYesterdayRecap,
  digestYesterdaySummaryText,
  isDigestMorning,
} from "./t3team-projectMyWorkDigestYesterdayRecap";

const ticket = (id: string, key: string, title: string) =>
  createTicket({ id, projectId: "p1", status: "Done", ref: { displayId: key, title } });

const tickets = [
  ticket("t-bump", "IES-25144", "Bump shared libs to 4.2"),
  ticket("t-koord", "IES-23704", "FE Koordination"),
  ticket("t-alarm", "IES-24744", "Alarm list filter"),
  ticket("t-time", "IES-23705", "Leistungsadmin export"),
  ticket("t-upd", "IES-24571", "Ressourcen Detail"),
];
const ticketsById = new Map(tickets.map((t) => [t.id, t]));

const pr = (repo: string, number: number, at: string, key?: string): DigestYesterdayMerged => ({
  id: `github.com:hive/${repo}#${number}`,
  projectId: "p1",
  repo: `hive/${repo}`,
  number,
  title: key ? `${key} Bump shared libs` : "Renovate: lockfile maintenance",
  mergedAt: `2026-10-05T${at}:00.000Z`,
  ...(key ? { workItemKey: key } : {}),
});

// The product owner's real Yesterday: three bump PRs for one ticket across repos, three moves, a
// bare Jira update, and one PR that names no ticket.
const yesterday: DigestYesterday = {
  merged: [
    pr("ies-alarm", 399, "09:00", "IES-25144"),
    pr("ies-psd", 241, "09:10", "IES-25144"),
    pr("ies-koordination", 851, "09:20", "IES-25144"),
    pr("ies-base-libs", 77, "08:00"),
  ],
  moved: [
    { ticketId: "t-koord", from: "In Progress", to: "Code Review", at: "2026-10-05T10:00:00Z" },
    { ticketId: "t-koord", from: "Code Review", to: "Done", at: "2026-10-05T15:00:00Z" },
    { ticketId: "t-alarm", from: "Code Review", to: "In Test", at: "2026-10-05T14:00:00Z" },
    { ticketId: "t-time", from: "To Do", to: "Time Logging", at: "2026-10-05T11:00:00Z" },
    { ticketId: "t-upd", at: "2026-10-05T16:00:00Z" },
  ],
};

describe("the yesterday recap", () => {
  const recap = digestYesterdayRecap(yesterday, ticketsById);

  it("groups by work item, newest first, with the last move as the outcome", () => {
    expect(
      recap.items.map((item) => [item.key, item.outcome?.to, item.merged.map((p) => p.number)]),
    ).toEqual([
      ["IES-23704", "Done", []],
      ["IES-24744", "In Test", []],
      ["IES-23705", "Time Logging", []],
      ["IES-25144", undefined, [851, 241, 399]],
    ]);
    expect(recap.items[0]?.outcome).toEqual({ from: "Code Review", to: "Done" });
  });

  it("drops a ticket that was only updated", () => {
    expect(recap.items.some((item) => item.key === "IES-24571")).toBe(false);
  });

  it("keeps PRs that name no ticket as their own lines", () => {
    expect(recap.loosePrs.map((p) => p.number)).toEqual([77]);
  });

  it("titles a PR's work item from the held ticket, else from the PR without its key", () => {
    expect(recap.items.find((i) => i.key === "IES-25144")).toMatchObject({
      ticketId: "t-bump",
      title: "Bump shared libs to 4.2",
    });
    const unheld = digestYesterdayRecap(yesterday, new Map());
    expect(unheld.items).toEqual([
      expect.objectContaining({
        key: "IES-25144",
        title: "Bump shared libs",
        merged: expect.any(Array),
      }),
    ]);
    expect(unheld.items[0]?.ticketId).toBeUndefined();
  });

  it("summarises merged PRs, done tickets and tickets handed to review or test", () => {
    expect(recap.summary).toEqual({ merged: 4, done: 1, review: 1, moved: 3 });
    expect(digestYesterdaySummaryText(recap.summary)).toBe(
      "4 PRs merged · 1 done · 1 to review/test",
    );
  });

  it("falls back to a move count when nothing landed in a counted lane", () => {
    expect(digestYesterdaySummaryText({ merged: 0, done: 0, review: 0, moved: 1 })).toBe(
      "1 ticket moved",
    );
    expect(digestYesterdaySummaryText({ merged: 1, done: 0, review: 0, moved: 0 })).toBe(
      "1 PR merged",
    );
  });

  it("is empty without a yesterday", () => {
    expect(digestYesterdayRecap(undefined, ticketsById)).toEqual({
      items: [],
      loosePrs: [],
      summary: { merged: 0, done: 0, review: 0, moved: 0 },
    });
  });
});

describe("the morning", () => {
  it("runs until local noon", () => {
    expect(isDigestMorning(new Date(2026, 9, 6, 0, 0).getTime())).toBe(true);
    expect(isDigestMorning(new Date(2026, 9, 6, 11, 59).getTime())).toBe(true);
    expect(isDigestMorning(new Date(2026, 9, 6, 12, 0).getTime())).toBe(false);
    expect(isDigestMorning(new Date(2026, 9, 6, 17, 30).getTime())).toBe(false);
  });
});
