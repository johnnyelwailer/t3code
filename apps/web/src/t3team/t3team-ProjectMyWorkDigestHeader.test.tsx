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
  it("labels an overrun sprint ended and keeps every marker inside the axis", () => {
    // 32 d into a 20 d sprint: the old bar printed "160 % elapsed" with width:160%.
    const markup = render(
      graphWith({ startDate: START, endDate: END, state: "active" }),
      Date.parse(START) + 32 * DAY,
    );
    expect(markup).toContain("ended 12 d ago");
    expect(markup).toContain("sprint over");
    expect(markup).not.toMatch(/left:1[1-9]\d%/);
    expect(markup).not.toContain("days left");
  });

  it("reads what is left in hours from the viewer's sprint estimates", () => {
    const ticket = (id: string, status: string, original: number, remaining: number) => ({
      id,
      projectId: "p",
      title: id,
      status,
      assignee: "Phil",
      sprintState: "active",
      updatedAt: START,
      timeOriginalEstimateSeconds: original * 3600,
      timeRemainingEstimateSeconds: remaining * 3600,
    });
    const markup = render(
      {
        ...graphWith({ startDate: START, endDate: END }),
        tickets: [ticket("a", "In Progress", 8, 5), ticket("b", "Done", 4, 1)],
      } as unknown as DigestGraph,
      Date.parse(START) + 10 * DAY,
    );
    // Done counts as nothing left, whatever its remaining estimate says.
    expect(markup).toContain(">5</b> of 12 h left");
    expect(markup).toContain("Day 10 of 20");
    expect(markup).toContain("days left");
    expect(markup).not.toContain("elapsed");
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
