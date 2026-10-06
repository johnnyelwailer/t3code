// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { ProjectMyWorkDigestHeader } from "~/t3team/t3team-ProjectMyWorkDigestHeader";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

const DAY = 24 * 60 * 60 * 1000;
const START = "2026-09-03T00:00:00.000Z";
const END = "2026-09-23T00:00:00.000Z";

function graphWith(sprint: { startDate: string; endDate: string; state?: string }): DigestGraph {
  return {
    scope: "project",
    projects: [{ id: "p", name: "Nexi AI" }],
    viewer: { name: "Phil", role: "PO", lastVisitAt: START },
    sprint: { name: "PW Sprint 8.5", goal: [], ...sprint },
    tickets: [],
    claims: [],
    decisions: [],
    changeRequests: [],
    transitions: [],
    blockers: [],
  } as DigestGraph;
}

const render = (graph: DigestGraph, nowMs: number) =>
  renderToStaticMarkup(<ProjectMyWorkDigestHeader graph={graph} nowMs={nowMs} />);

describe("ProjectMyWorkDigestHeader sprint progress", () => {
  it("clamps an overrun sprint to a full bar and labels it ended", () => {
    // 32 d into a 20 d sprint: unclamped this printed "160 % elapsed" with width:160%.
    const markup = render(
      graphWith({ startDate: START, endDate: END, state: "active" }),
      Date.parse(START) + 32 * DAY,
    );
    expect(markup).toContain("ended 12 d ago");
    expect(markup).toContain("width:100%");
    expect(markup).not.toMatch(/width:1[1-9]\d%|left:1[1-9]\d%/);
    expect(markup).not.toContain("% elapsed");
    expect(markup).not.toContain("days left");
  });

  it("shows percent elapsed and days left while the sprint runs", () => {
    const markup = render(
      graphWith({ startDate: START, endDate: END }),
      Date.parse(START) + 10 * DAY,
    );
    expect(markup).toContain("50 % elapsed");
    expect(markup).toContain("Day 10 of 20");
    expect(markup).toContain("days left");
  });

  it("hides the progress row when the sprint dates are unknown", () => {
    const now = Date.parse(START);
    const markup = render(graphWith({ startDate: START, endDate: START }), now);
    expect(markup).toContain("PW Sprint 8.5");
    expect(markup).not.toContain("elapsed");
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("rounded-full bg-foreground");
    expect(markup).not.toContain("Day ");
  });
});
