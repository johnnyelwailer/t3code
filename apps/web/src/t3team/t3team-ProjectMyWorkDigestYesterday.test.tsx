// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { DashboardWidget } from "./t3team-dashboardWidgetRegistry";
import type { DigestGraph, DigestSection } from "./t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "./t3team-types";

const ticket = {
  id: "t-1",
  projectId: "p1",
  status: "In Review",
  ref: { displayId: "IES-2", title: "Wire the alarm" },
} as unknown as ProjectTicket;

const graph = {
  scope: "project",
  projects: [{ id: "p1", name: "P" }],
  viewer: { name: "Philip", role: "", lastVisitAt: "2026-10-05T00:00:00.000Z" },
  tickets: [ticket],
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
  yesterday: {
    merged: [
      {
        id: "github.com:hive/ies-alarm#7",
        projectId: "p1",
        host: "github.com",
        repo: "hive/ies-alarm",
        number: 7,
        title: "IES-2 fix the alarm",
        mergedAt: "2026-10-05T10:00:00.000Z",
      },
    ],
    moved: [{ ticketId: "t-1", from: "To Do", to: "In Review", at: "2026-10-05T11:00:00.000Z" }],
  },
} as DigestGraph;

const section: DigestSection = {
  id: "yesterday",
  kind: "graph",
  widget: "my-work.yesterday",
  placement: "footer",
  heading: "Yesterday",
  items: [],
};
const lane = { graph, ticketsById: new Map([[ticket.id, ticket]]), nowMs: 0 };
const render = (placement: "side" | "main" | "footer") =>
  renderToStaticMarkup(<DashboardWidget section={section} placement={placement} {...lane} />);

describe("the yesterday widget", () => {
  it("lists what was merged and moved, each row a link", () => {
    const html = render("footer");
    expect(html).toContain("Yesterday");
    expect(html).toContain("Merged");
    expect(html).toContain("ies-alarm#");
    expect(html).toContain('href="https://github.com/hive/ies-alarm/pull/7"');
    expect(html).toContain("IES-2 fix the alarm");
    expect(html).toContain("Moved");
    expect(html).toContain("Wire the alarm");
    expect(html).toContain("To Do");
    expect(html).toContain("In Review");
    // The ticket row is a button for the digest's ticket opener, not a second PR link.
    expect(html).toMatch(/<button[^>]*>[^]*IES-2/);
  });

  it("stands in the side lane too, and nowhere else", () => {
    expect(render("side")).toContain("Moved");
    expect(render("main")).toBe("");
  });

  it("renders nothing when there is nothing to show", () => {
    const { yesterday: _yesterday, ...empty } = graph;
    expect(
      renderToStaticMarkup(
        <DashboardWidget section={section} placement="footer" {...lane} graph={empty} />,
      ),
    ).toBe("");
  });
});
