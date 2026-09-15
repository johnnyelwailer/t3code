import { describe, expect, it } from "vite-plus/test";

import {
  assembleMyWorkDigestChangeRequests,
  assembleMyWorkDigestPayload,
  assembleMyWorkDigestProjectData,
  digestChangeRequestStateFromPr,
  matchDigestWorkItemKey,
  pickDigestSprint,
} from "./t3team-myworkDigestAggregation.ts";
import { digestAgentLabel } from "./t3team-myworkDigestAgents.ts";
import { parseDecisionQuestionEntry } from "./t3team-myworkDigestQueries.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import type {
  T3TeamDigestProjectSource,
  T3TeamMyWorkDigestProjectInput,
} from "./t3team-myworkDigestTypes.ts";

const TICKETS = 500;
const THREADS = 50;
const PULL_REQUESTS = 100;

const input: T3TeamMyWorkDigestProjectInput = {
  account: { id: "acct-1", provider: "atlassian" },
  externalProjectId: "IES",
  appProjectId: "app-proj-1",
  name: "IES NG",
};

function fixtureSources(): T3TeamDigestProjectSource {
  const tickets: BacklogResourceRef[] = Array.from({ length: TICKETS }, (_, i) => ({
    id: `issue-${1000 + i}`,
    displayId: `IES-${1000 + i}`,
    title: `Ticket ${1000 + i}`,
    status: i % 3 === 0 ? "To Do" : i % 3 === 1 ? "In Progress" : "Done",
    assignee: i % 4 === 0 ? "Philip" : "Someone",
    // Newest first: ticket 0 is freshest.
    updatedAt: new Date(Date.UTC(2026, 8, 14, 9, 0) - i * 1000).toISOString(),
    url: "https://jira/IES",
    provider: "atlassian",
    kind: "issue",
    // The first ten tickets sit in the active sprint; the viewer's three of
    // them (0, 4, 8) carry point estimates for the burndown.
    ...(i < 10 ? { sprintName: "PW Sprint 8.5", estimateValue: i % 2 === 0 ? 3 : 2 } : {}),
    ...(i === 0 ? { links: [{ outward: "is blocked by", key: "IES-1001" }] } : {}),
  }));

  const claims = Array.from({ length: THREADS }, (_, i) => ({
    threadId: `thread-${i}`,
    threadTitle: `Work on IES-${1000 + i}`,
    ticketRef: { issueId: `issue-${1000 + i}`, issueKey: `IES-${1000 + i}` },
    agent: i % 2 === 0 ? "codex" : "claude",
    lastActivityAt: new Date(Date.UTC(2026, 8, 14, 8, 0) - i * 60_000).toISOString(),
  }));

  const decisions = [
    {
      id: "corr-1",
      threadId: "thread-0",
      ticketRef: { issueId: "issue-1000", issueKey: "IES-1000" },
      question: "Approve the deployment?",
      askedAt: "2026-09-14T08:00:00.000Z",
    },
  ];

  type PrEntry = T3TeamDigestProjectSource["prEntries"][number];
  const prEntries: Array<{ -readonly [K in keyof PrEntry]: PrEntry[K] }> = Array.from(
    { length: PULL_REQUESTS },
    (_, i) => {
      // Half the PRs name a ticket key; quarter are closed, a slice of those merged;
      // a few are draft; a few have failing checks.
      const closed = i % 4 === 3;
      const merged = i % 8 === 7;
      return {
        host: "github.com",
        repository: "hive/ies-spital",
        number: 100 + i,
        title: i % 2 === 0 ? `Fix IES-${1001 + (i % 100)}` : `chore: no key here ${i}`,
        headBranch: `feat/ies-${1002 + (i % 50)}-part`,
        state: closed ? (merged ? "merged" : "closed") : "open",
        isDraft: i % 10 === 9,
        updatedAt: new Date(Date.UTC(2026, 8, 14, 7, 0) - i * 30_000).toISOString(),
        viewerReviewRequested: i % 5 === 0,
        ...(i % 5 === 1 ? { reviewDecision: "changes-requested" as const } : {}),
        ...(i % 5 === 2 ? { reviewDecision: "approved" as const } : {}),
        ...(i % 7 === 5 ? { checksState: "failing" as const } : {}),
      };
    },
  );

  const transitions = [
    {
      ticketRef: { issueId: "issue-1000", issueKey: "IES-1000" },
      from: "In Progress",
      to: "Code Review",
      at: "2026-09-14T06:00:00.000Z",
    },
  ];

  const sprints = [
    {
      id: "s-1",
      name: "PW Sprint 8.4",
      state: "closed",
      goal: "old",
      startDate: "2026-08-01",
      endDate: "2026-08-22",
    },
    {
      id: "s-2",
      name: "PW Sprint 8.5",
      state: "active",
      goal: "Ready für FAT\nDeep-Link aus PI-5 sichtbar",
      startDate: "2026-09-03",
      endDate: "2026-09-23",
    },
  ];

  // The freshest open PR (i=0, IES-1001) arrives enriched off the cached
  // detail/activity reads; its sibling PR (i=2, IES-1003) names a blocker.
  prEntries[0]!.reviewers = [{ name: "Alice", login: "alice" }];
  prEntries[0]!.unhandledReviewThreads = [{ lastCommentAt: "2026-09-14T01:00:00.000Z" }, {}];
  prEntries[0]!.body = "";
  prEntries[2]!.body = "Depends on hive/ies-spital#555 for the API.";

  return {
    input,
    tickets,
    threadTickets: claims.map((claim) => ({
      threadId: claim.threadId,
      ticketRef: claim.ticketRef,
    })),
    claims,
    decisions,
    prEntries,
    transitions,
    sprints,
    viewerName: "Philip",
    estimateUnit: "points",
    nowIso: "2026-09-14T10:00:00.000Z",
  };
}

describe("my work digest aggregation", () => {
  it("carries the PR enrichment: reviewers and unhandled review threads", () => {
    const changeRequests = assembleMyWorkDigestChangeRequests(fixtureSources());
    const pr100 = changeRequests.find((pr) => pr.number === 100);
    expect(pr100?.reviewers).toEqual([{ name: "Alice", login: "alice" }]);
    expect(pr100?.unhandledReviewThreads).toEqual([
      { lastCommentAt: "2026-09-14T01:00:00.000Z" },
      {},
    ]);
    // Merged rows are never enriched: no reviewer faces on the merged chip.
    const merged = changeRequests.filter((pr) => pr.state === "merged");
    expect(merged.every((pr) => pr.reviewers === undefined)).toBe(true);
  });

  it("resolves blockers from Jira 'is blocked by' links and PR body mentions", () => {
    const data = assembleMyWorkDigestProjectData(fixtureSources());
    const blockers = data.blockers ?? [];
    // (a) IES-1000 is blocked by IES-1001; PR #100 titles IES-1001.
    const linked = blockers.find((blocker) => blocker.ticketRef.issueKey === "IES-1000");
    expect(linked).toEqual({
      ticketRef: { issueId: "issue-1000", issueKey: "IES-1000" },
      repo: "hive/ies-spital",
      number: 100,
    });
    // (b) PR #102 (IES-1003) says it depends on hive/ies-spital#555.
    const mentioned = blockers.find((blocker) => blocker.ticketRef.issueKey === "IES-1003");
    expect(mentioned).toEqual({
      ticketRef: { issueId: "issue-1003", issueKey: "IES-1003" },
      repo: "hive/ies-spital",
      number: 555,
    });
    expect(blockers).toHaveLength(2);
  });

  it("builds the viewer's burndown from sprint items, estimates, and history", () => {
    const data = assembleMyWorkDigestProjectData(fixtureSources());
    const burndown = data.burndown;
    expect(burndown?.unit).toBe("points");
    expect(burndown?.total).toBe(9); // 3 + 3 (issue-1008 is Done but still estimated)
    // 2026-09-03 .. 2026-09-14 (now) inclusive.
    expect(burndown?.points).toHaveLength(12);
    expect(burndown?.points[0]?.date).toBe("2026-09-03");
    expect(burndown?.points.at(-1)?.date).toBe("2026-09-14");
    // Nothing of Philip's moves toward Done in the fixture: a flat line.
    expect(burndown?.points.every((point) => point.remaining === 6)).toBe(true);
  });

  it("leaves the burndown out without a viewer or without sprint items", () => {
    const withoutViewer = assembleMyWorkDigestProjectData({
      ...fixtureSources(),
      viewerName: "",
    });
    expect(withoutViewer.burndown).toBeUndefined();
    const withoutSprint = assembleMyWorkDigestProjectData({
      ...fixtureSources(),
      tickets: fixtureSources().tickets.map((ticket) => {
        const { sprintName: _dropped, ...rest } = ticket;
        return rest;
      }),
    });
    expect(withoutSprint.burndown).toBeUndefined();
  });

  it("joins a 500-ticket / 50-thread / 100-PR project in one pass", () => {
    const started = performance.now();
    const payload = assembleMyWorkDigestPayload({ scope: "project", sources: [fixtureSources()] });
    const elapsedMs = performance.now() - started;

    expect(elapsedMs).toBeLessThan(200); // sanity bound for the pure join
    expect(payload.scope).toBe("project");
    expect(payload.projects).toHaveLength(1);

    const data = payload.projects[0]!;
    expect(data.project).toEqual({ id: "IES", name: "IES NG" });
    expect(data.tickets).toHaveLength(TICKETS);
    // Newest first: ticket 0 (freshest) leads.
    expect(data.tickets[0]?.id).toBe("issue-1000");
    expect(data.tickets[TICKETS - 1]?.id).toBe(`issue-${999 + TICKETS}`);
    expect(data.claims).toHaveLength(THREADS);
    expect(data.decisions).toHaveLength(1);
    expect(data.transitions).toHaveLength(1);
    expect(data.sprint?.name).toBe("PW Sprint 8.5");
    expect(data.changeRequestNote).toBeUndefined();
  }, 10_000);

  it("matches PRs to tickets by key and maps the chip states", () => {
    const source = fixtureSources();
    const changeRequests = assembleMyWorkDigestChangeRequests(source);
    const openExpected = source.prEntries.filter((entry) => entry.state === "open").length;
    const mergedExpected = source.prEntries.filter((entry) => entry.state === "merged").length;
    expect(changeRequests).toHaveLength(openExpected + mergedExpected);
    expect(changeRequests.every((pr) => pr.id.startsWith("github.com:hive/ies-spital#"))).toBe(
      true,
    );

    const states = new Map(changeRequests.map((pr) => [pr.number, pr.state]));
    expect(states.get(100)).toBe("needs-you"); // i=0: viewer review requested
    expect(states.get(101)).toBe("changes-requested");
    expect(states.get(102)).toBe("approved");
    expect(states.get(104)).toBe("open"); // plain open PR
    expect(states.get(105)).toBe("ci-failing"); // failing checks beat needs-you (i=5 is both)
    expect(states.get(107)).toBe("merged"); // merged beats its approved decision
    expect(states.get(109)).toBe("draft"); // i=9: draft, no flags
    // Plain closed PRs never appear.
    expect(states.has(103)).toBe(false); // i=3 → closed

    const matched = changeRequests.filter((pr) => pr.workItemKey !== undefined);
    const unmatched = changeRequests.filter((pr) => pr.workItemKey === undefined);
    // Odd i: title has no key, but the head branch names IES-1002+i — only some
    // of those keys exist in the 500-ticket set.
    expect(matched.length).toBeGreaterThan(0);
    expect(unmatched.length).toBeGreaterThan(0);
    // Every matched key must be a real ticket key.
    const keys = new Set(source.tickets.map((ticket) => ticket.displayId));
    for (const pr of matched) {
      expect(keys.has(pr.workItemKey as string)).toBe(true);
    }
  });

  it("passes the PR-unavailable note through to the project data", () => {
    const payload = assembleMyWorkDigestPayload({
      scope: "all",
      sources: [{ ...fixtureSources(), changeRequestNote: "GitHub CLI is not authenticated." }],
    });
    expect(payload.projects[0]?.changeRequestNote).toBe("GitHub CLI is not authenticated.");
    expect(payload.scope).toBe("all");
  });
});

describe("digest PR helpers", () => {
  it("matches work item keys only against known tickets", () => {
    const keys = new Set(["IES-13068", "NXAI-480"]);
    expect(matchDigestWorkItemKey("IES-13068 EdO Transport", "feat/ed-o", keys)).toBe("IES-13068");
    expect(matchDigestWorkItemKey("fix (NXAI-480)", "main", keys)).toBe("NXAI-480");
    expect(matchDigestWorkItemKey("FOO-1 unknown project", "foo", keys)).toBeUndefined();
    expect(matchDigestWorkItemKey("no key", "no-key", keys)).toBeUndefined();
  });

  it("maps PR states onto the digest chip states", () => {
    expect(
      digestChangeRequestStateFromPr({
        state: "merged",
        isDraft: false,
        viewerReviewRequested: true,
      }),
    ).toBe("merged");
    expect(
      digestChangeRequestStateFromPr({
        state: "open",
        isDraft: false,
        viewerReviewRequested: true,
        checksState: "failing",
      }),
    ).toBe("ci-failing");
    expect(
      digestChangeRequestStateFromPr({
        state: "open",
        isDraft: false,
        viewerReviewRequested: true,
        reviewDecision: "changes-requested",
      }),
    ).toBe("changes-requested");
    expect(
      digestChangeRequestStateFromPr({
        state: "open",
        isDraft: false,
        viewerReviewRequested: true,
      }),
    ).toBe("needs-you");
    expect(
      digestChangeRequestStateFromPr({
        state: "open",
        isDraft: true,
        viewerReviewRequested: false,
        reviewDecision: "approved",
      }),
    ).toBe("approved");
    expect(
      digestChangeRequestStateFromPr({
        state: "open",
        isDraft: true,
        viewerReviewRequested: false,
      }),
    ).toBe("draft");
    expect(
      digestChangeRequestStateFromPr({
        state: "open",
        isDraft: false,
        viewerReviewRequested: false,
      }),
    ).toBe("open");
  });

  it("picks the active sprint, else the first known one", () => {
    const sprints = [
      { id: "1", name: "A", state: "closed" },
      {
        id: "2",
        name: "B",
        state: "ACTIVE",
        goal: " goal ",
        startDate: "2026-09-03",
        endDate: "2026-09-23",
      },
    ];
    const picked = pickDigestSprint(sprints);
    expect(picked?.name).toBe("B");
    expect(picked?.goal).toBe(" goal ");
    expect(pickDigestSprint([{ id: "1", name: "A" }])?.name).toBe("A");
    expect(pickDigestSprint([])).toBeUndefined();
  });
});

describe("claim agent labels", () => {
  it("formats '<Provider> · <model>' from the stored thread record", () => {
    expect(digestAgentLabel({ providerName: "codex", model: "gpt-5.1-codex" })).toBe(
      "Codex · gpt-5.1-codex",
    );
    expect(digestAgentLabel({ providerName: "claude", model: "claude-sonnet-4-5" })).toBe(
      "Claude · claude-sonnet-4-5",
    );
  });

  it("falls back to the message-id inference, and to 'agent' last", () => {
    expect(digestAgentLabel({ providerName: null, model: "m", inferredProvider: "codex" })).toBe(
      "Codex · m",
    );
    expect(digestAgentLabel({ providerName: null, model: "m" })).toBe("agent · m");
    expect(digestAgentLabel({ providerName: null, model: "", inferredProvider: "claude" })).toBe(
      "Claude",
    );
  });
});

describe("decision question parsing", () => {
  it("reads the question from journal wire entries, defensively", () => {
    expect(
      parseDecisionQuestionEntry(
        JSON.stringify({
          kind: "user.input",
          correlationId: "c1",
          payload: { question: "Ship it?" },
        }),
        "c1",
      ),
    ).toBe("Ship it?");
    expect(
      parseDecisionQuestionEntry(
        JSON.stringify({ kind: "user.input", payload: { prompt: "Ship it?" } }),
        "c1",
      ),
    ).toBe("Ship it?");
    // A different correlation is not this ask.
    expect(
      parseDecisionQuestionEntry(
        JSON.stringify({ correlationId: "other", payload: { question: "No" } }),
        "c1",
      ),
    ).toBeUndefined();
    expect(parseDecisionQuestionEntry("not-json", "c1")).toBeUndefined();
    expect(parseDecisionQuestionEntry(JSON.stringify({ payload: {} }), "c1")).toBeUndefined();
  });
});
