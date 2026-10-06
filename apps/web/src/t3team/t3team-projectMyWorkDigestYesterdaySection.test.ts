import { describe, expect, it } from "vite-plus/test";

import {
  buildDigestPlan,
  buildHeuristicDigestPlan,
  resolveDigestPlan,
  type DigestGraph,
  type DigestPlan,
} from "./t3team-projectMyWorkDigestPlan";

const NOW = Date.parse("2026-10-06T08:00:00.000Z");
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
  it("is in the footer of the heuristic plan, as history rather than an ask", () => {
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

  it("trails in the footer of an arrangement made before it existed", () => {
    const resolved = resolveDigestPlan(agentPlan([]), graph(withYesterday), NOW);
    expect(resolved.sections.map((s) => [s.id, s.placement])).toEqual([["yesterday", "footer"]]);
  });

  it("does not double up on the default plan", () => {
    expect(buildDigestPlan(graph(withYesterday), NOW).sections.map((s) => s.id)).toEqual([
      "yesterday",
    ]);
  });
});
