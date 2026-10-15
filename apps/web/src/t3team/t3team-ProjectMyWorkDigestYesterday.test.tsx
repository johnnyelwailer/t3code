// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { DigestYesterdayWidget } from "./t3team-ProjectMyWorkDigestYesterday";
import type { DigestGraph } from "./t3team-projectMyWorkDigestPlan";

const MORNING = new Date(2026, 9, 6, 9, 0).getTime();
const story = createTicket({
  id: "s1",
  projectId: "p1",
  issueType: "Story",
  issueTypeIsSubtask: false,
  ref: { displayId: "IES-23265", title: "Einheitliche Formulardarstellung" },
});
const sub = (id: string, key: string, title: string) =>
  createTicket({
    id,
    projectId: "p1",
    parentId: "s1",
    issueType: "Sub-task",
    issueTypeIsSubtask: true,
    ref: { displayId: key, title },
  });
const lone = createTicket({
  id: "s2",
  projectId: "p1",
  issueType: "Story",
  issueTypeIsSubtask: false,
  ref: { displayId: "IES-20767", title: "Standalone story" },
});
const tickets = [
  story,
  sub("a", "IES-23704", "FE: Review"),
  sub("b", "IES-23705", "BE: Test"),
  lone,
];
const at = "2026-10-05T10:00:00Z";
const graph = {
  scope: "project",
  projects: [{ id: "p1", name: "P" }],
  viewer: { name: "Phil", role: "", lastVisitAt: at },
  tickets,
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
  yesterday: {
    from: new Date(2026, 9, 5).toISOString(),
    merged: [],
    moved: [
      { ticketId: "a", from: "Code Review", to: "Done", at },
      { ticketId: "b", from: "In Progress", to: "In Test", at },
      { ticketId: "s2", from: "In Progress", to: "Done", at },
    ],
  },
} as unknown as DigestGraph;

const markup = renderToStaticMarkup(
  <DigestYesterdayWidget
    section={{
      id: "yesterday",
      kind: "graph",
      widget: "my-work.yesterday",
      placement: "side",
      heading: "Yesterday",
      items: [],
    }}
    graph={graph}
    ticketsById={new Map(tickets.map((t) => [t.id, t]))}
    nowMs={MORNING}
  />,
);

describe("the yesterday widget", () => {
  it("heads subtasks with their parent story and its roll-up", () => {
    expect(markup.match(/digest-yesterday-story-group/g)).toHaveLength(1);
    const group = markup.slice(markup.indexOf("digest-yesterday-story-group"));
    expect(group.indexOf("IES-23265")).toBeLessThan(group.indexOf("IES-23704"));
    expect(markup).toContain("Einheitliche Formulardarstellung");
    expect(markup).toContain("1 → Done · 1 → In Test");
  });

  it("keeps a standalone story as its own row", () => {
    expect(markup).toContain("IES-20767");
  });

  it("shows no permanent Hide control", () => {
    expect(markup).not.toMatch(/>Hide</);
    expect(markup).not.toContain("Hide yesterday");
    expect(markup).toContain("opacity-0");
  });
});
