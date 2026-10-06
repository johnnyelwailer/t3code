// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
  type DigestGraph,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  DIGEST_FIXTURE_NOW_MS,
  HOUR,
  IES,
  viewer,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";
import { createProjectBacklogTestTicket } from "~/t3team/t3team-projectBacklogTestUtils";

const NOW = DIGEST_FIXTURE_NOW_MS;

// The owner's case: an assigned ticket "In Analysis" on a project without a running sprint and
// with nothing awaiting a decision. It used to collapse into the "Parked" footer under a
// "Nothing needs you right now" banner.
const graph: DigestGraph = {
  scope: "project",
  projects: [IES],
  viewer,
  tickets: [
    createProjectBacklogTestTicket({
      id: "analysis-1",
      projectId: IES.id,
      status: "In Analysis",
      assignee: viewer.name,
      updatedAt: new Date(NOW - 30 * HOUR).toISOString(),
      ref: { displayId: "IES-1", title: "Clarify the import rules" },
    }),
  ],
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
};

describe("digest 'Your tickets' bucket", () => {
  it("shows the viewer's assigned non-sprint ticket with its status above the parked footer", () => {
    const plan = resolveDigestPlan(buildHeuristicDigestPlan(graph, NOW), graph, NOW);
    expect(plan.sections.map((section) => [section.id, section.placement])).toEqual([
      ["your-tickets", "main"],
    ]);

    const markup = renderToStaticMarkup(
      <ProjectMyWorkDigestView plan={plan} graph={graph} nowMs={NOW} updatedAtMs={NOW - HOUR} />,
    );
    expect(markup).toContain("Your tickets");
    expect(markup).toContain("Clarify the import rules");
    expect(markup).toContain("In Analysis");
    expect(markup).not.toContain("Nothing needs you right now");
    expect(markup).not.toContain("Parked");
  });
});
