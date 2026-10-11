import { describe, expect, it } from "vite-plus/test";

import { buildDigestWidgetSrcdoc, digestWidgetSnapshot } from "./t3team-myworkDigestWidgetSrcdoc";
import {
  buildDigestPlan,
  type DigestGraph,
  type DigestPlan,
} from "./t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "./t3team-types";

const NOW = Date.parse("2026-10-06T08:00:00.000Z");

const ticket = (id: string): ProjectTicket =>
  ({
    id,
    projectId: "p1",
    status: "In Progress",
    ref: { displayId: id.toUpperCase(), title: `Ticket ${id}` },
  }) as unknown as ProjectTicket;

const plan = (heading: string, extra: DigestPlan["sections"] = []): DigestPlan => ({
  producer: "agent",
  producedAt: "2026-10-06T07:00:00.000Z",
  sections: [
    { id: "now", kind: "items", placement: "main", heading, items: [{ ticketId: "t-1" }] },
    ...extra,
  ],
});

const graph = (overrides: Partial<DigestGraph>): DigestGraph => ({
  scope: "project",
  projects: [{ id: "p1", name: "P" }],
  viewer: { name: "Pat", role: "", lastVisitAt: "2026-10-05T00:00:00.000Z" },
  tickets: [ticket("t-1"), ticket("t-2")],
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
  ...overrides,
});

const widget = (widgetHtml: string) =>
  ({
    id: "count",
    kind: "widget",
    placement: "side",
    heading: "Open count",
    items: [],
    widgetHtml,
  }) as const;

describe("My Work draft arrangement", () => {
  it("renders the draft over the live plan, and the live plan when no draft is pending", () => {
    const withDraft = graph({ arrangement: plan("Live"), draftArrangement: plan("Draft") });
    expect(buildDigestPlan(withDraft, NOW).sections[0]?.heading).toBe("Draft");
    expect(buildDigestPlan(graph({ arrangement: plan("Live") }), NOW).sections[0]?.heading).toBe(
      "Live",
    );
  });

  it("keeps a widget section with markup even though it lists no tickets", () => {
    const resolved = buildDigestPlan(
      graph({ draftArrangement: plan("Draft", [widget("<b>2</b>")]) }),
      NOW,
    );
    expect(resolved.sections.map((section) => section.id)).toEqual(["now", "count"]);
    const empty = buildDigestPlan(graph({ draftArrangement: plan("Draft", [widget("")]) }), NOW);
    expect(empty.sections.map((section) => section.id)).toEqual(["now"]);
  });
});

describe("My Work widget section srcdoc", () => {
  const section = widget("<div id=n></div>");
  const snapshot = digestWidgetSnapshot(section, graph({}));

  it("hands the widget a frozen snapshot of the view, never the network", () => {
    expect(snapshot.tickets[0]).toEqual({
      id: "t-1",
      key: "T-1",
      title: "Ticket t-1",
      status: "In Progress",
    });
    const srcdoc = buildDigestWidgetSrcdoc({ html: section.widgetHtml, snapshot, themeCss: "" });
    expect(srcdoc).toContain("connect-src 'none'");
    expect(srcdoc).toContain("window.viewData=Object.freeze(");
  });

  it("escapes ticket text so it cannot close the data script", () => {
    const hostile = digestWidgetSnapshot(section, graph({ tickets: [ticket("</script><b>")] }));
    const srcdoc = buildDigestWidgetSrcdoc({ html: "<i>x</i>", snapshot: hostile, themeCss: "" });
    expect(srcdoc).not.toContain("</script><b>");
  });

  it("refuses markup that reaches the network", () => {
    for (const html of [
      "<script>fetch('/x')</script>",
      '<script src="https://cdn.example/x.js"></script>',
      "<script>new WebSocket('ws://x')</script>",
    ]) {
      expect(buildDigestWidgetSrcdoc({ html, snapshot, themeCss: "" })).toBeUndefined();
    }
  });
});
