import { describe, expect, it } from "vite-plus/test";

import {
  DashboardWidget,
  dashboardWidgetResetKeys,
  digestSectionWidgetId,
} from "./t3team-dashboardWidgetRegistry";
import type { DigestGraph, DigestSection } from "./t3team-projectMyWorkDigestPlan";

const graph = {
  scope: "project",
  projects: [],
  viewer: { name: "Philip", role: "", lastVisitAt: "2026-10-01T00:00:00.000Z" },
  tickets: [],
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
} as DigestGraph;
const lane = { graph, ticketsById: new Map(), nowMs: 0 };
const section = (extra: Partial<DigestSection>): DigestSection => ({
  id: "s",
  kind: "items",
  placement: "main",
  heading: "S",
  items: [],
  ...extra,
});

describe("dashboard widget registry", () => {
  it("defaults a section to the widget for what it lists", () => {
    expect(digestSectionWidgetId(section({}))).toBe("my-work.tickets");
    expect(digestSectionWidgetId(section({ kind: "reviews" }))).toBe("my-work.reviews");
    expect(digestSectionWidgetId(section({ widget: "my-work.reviews" }))).toBe("my-work.reviews");
  });

  it("renders nothing for a widget it does not know or a placement the widget does not allow", () => {
    expect(
      DashboardWidget({ section: section({ widget: "nope" }), placement: "main", ...lane }),
    ).toBeNull();
    expect(
      DashboardWidget({
        section: section({ widget: "my-work.reviews" }),
        placement: "footer",
        ...lane,
      }),
    ).toBeNull();
  });
});

describe("dashboard widget reset keys", () => {
  const keys = (extra: Partial<DigestSection>, placement: "main" | "side" = "main") =>
    dashboardWidgetResetKeys("my-work.tickets", { section: section(extra), placement });

  it("changes when the section's tickets or reviews change, so a refresh retries a failed widget", () => {
    const base = keys({ items: [{ ticketId: "A-1" }] });
    expect(keys({ items: [{ ticketId: "A-1" }] })).toEqual(base);
    expect(keys({ items: [{ ticketId: "A-2" }] })).not.toEqual(base);
    expect(keys({ kind: "reviews", reviewIds: ["r1"] })).not.toEqual(keys({ kind: "reviews" }));
    expect(keys({ id: "other" })).not.toEqual(keys({}));
    expect(keys({}, "side")).not.toEqual(keys({}));
  });
});
