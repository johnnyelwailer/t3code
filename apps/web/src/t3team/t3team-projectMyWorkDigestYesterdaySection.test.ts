import { describe, expect, it } from "vite-plus/test";

import {
  buildDigestPlan,
  buildHeuristicDigestPlan,
  resolveDigestPlan,
  type DigestGraph,
  type DigestPlan,
} from "./t3team-projectMyWorkDigestPlan";

// Local wall-clock times: the default placement follows the viewer's own morning.
const MORNING = new Date(2026, 9, 6, 9, 0).getTime();
const NOW = new Date(2026, 9, 6, 15, 0).getTime();
const withYesterday: DigestGraph["yesterday"] = {
  merged: [
    {
      id: "github.com:a/b#1",
      projectId: "p1",
      repo: "a/b",
      number: 1,
      title: "merged",
      mergedAt: "2026-10-05T10:00:00.000Z",
    },
  ],
  moved: [],
};

function graph(yesterday?: DigestGraph["yesterday"]): DigestGraph {
  return {
    scope: "project",
    projects: [{ id: "p1", name: "P" }],
    viewer: { name: "Philip", role: "", lastVisitAt: "2026-10-05T00:00:00.000Z" },
    tickets: [],
    claims: [],
    decisions: [],
    changeRequests: [],
    transitions: [],
    blockers: [],
    ...(yesterday !== undefined ? { yesterday } : {}),
  };
}

const yesterdaySection = (placement: "side" | "footer") => ({
  id: "yesterday",
  kind: "graph" as const,
  widget: "my-work.yesterday",
  placement,
  heading: "Yesterday",
  items: [],
});
const agentPlan = (sections: DigestPlan["sections"]): DigestPlan => ({
  producer: "agent",
  producedAt: "2026-10-06T07:00:00.000Z",
  sections,
});

describe("the yesterday section of the plan", () => {
  it("leads the heuristic plan before noon, above the reviews owed", () => {
    const withReview = {
      ...graph(withYesterday),
      reviewRequests: [{ id: "r1" }] as unknown as NonNullable<DigestGraph["reviewRequests"]>,
    };
    const plan = buildHeuristicDigestPlan(withReview, MORNING);
    expect(plan.sections.map((s) => [s.id, s.placement])).toEqual([
      ["yesterday", "side"],
      ["to-review", "side"],
    ]);
  });

  it("is in the footer of the heuristic plan after noon, as history rather than an ask", () => {
    const plan = buildHeuristicDigestPlan(graph(withYesterday), NOW);
    expect(plan.sections).toEqual([
      expect.objectContaining({
        id: "yesterday",
        kind: "graph",
        widget: "my-work.yesterday",
        placement: "footer",
        items: [],
      }),
    ]);
  });

  it("is absent when there was no yesterday", () => {
    expect(buildHeuristicDigestPlan(graph(), NOW).sections).toEqual([]);
  });

  it("stays where an arrangement put it, and is dropped when it has nothing to show", () => {
    const arranged = agentPlan([yesterdaySection("side")]);
    const kept = resolveDigestPlan(arranged, graph(withYesterday), NOW);
    expect(kept.sections.map((s) => [s.id, s.placement])).toEqual([["yesterday", "side"]]);
    expect(resolveDigestPlan(arranged, graph(), NOW).sections).toEqual([]);
  });

  it("trails in the footer of an arrangement made before it existed, even in the morning", () => {
    const resolved = resolveDigestPlan(agentPlan([]), graph(withYesterday), MORNING);
    expect(resolved.sections.map((s) => [s.id, s.placement])).toEqual([["yesterday", "footer"]]);
  });

  it("keeps an arrangement's footer placement in the morning", () => {
    const arranged = agentPlan([yesterdaySection("footer")]);
    const kept = resolveDigestPlan(arranged, graph(withYesterday), MORNING);
    expect(kept.sections.map((s) => [s.id, s.placement])).toEqual([["yesterday", "footer"]]);
  });

  it("is absent when Jira merely updated tickets", () => {
    const updatedOnly = { merged: [], moved: [{ ticketId: "t", at: "2026-10-05T10:00:00Z" }] };
    expect(buildHeuristicDigestPlan(graph(updatedOnly), MORNING).sections).toEqual([]);
  });

  it("is absent when a filter hid every ticket that moved and nothing was merged", () => {
    // The status filter narrows `tickets`, not `yesterday`: the moves are there, their tickets are not.
    const movedHidden = {
      merged: [],
      moved: [
        { ticketId: "t-hidden", from: "Code Review", to: "Done", at: "2026-10-05T10:00:00Z" },
      ],
    };
    expect(buildHeuristicDigestPlan(graph(movedHidden), MORNING).sections).toEqual([]);
    const arranged = agentPlan([yesterdaySection("side")]);
    expect(resolveDigestPlan(arranged, graph(movedHidden), MORNING).sections).toEqual([]);
  });

  it("does not double up on the default plan", () => {
    expect(buildDigestPlan(graph(withYesterday), NOW).sections.map((s) => s.id)).toEqual([
      "yesterday",
    ]);
  });
});
