import { describe, expect, it } from "vite-plus/test";

import { defineDashboardWidget } from "./t3team-sdk.dashboardWidget.ts";

const valid = {
  id: "my-work.tickets",
  version: "1.0.0",
  title: "Tickets",
  surfaces: ["project.dashboard.myWork"],
  component: "digest-tickets",
  content: "tickets",
  placements: ["side", "main"],
} as const;

describe("defineDashboardWidget", () => {
  it("accepts a widget for a known surface and placements", () => {
    expect(defineDashboardWidget(valid).placements).toEqual(["side", "main"]);
  });

  it("rejects a placement the dashboard does not have", () => {
    expect(() => defineDashboardWidget({ ...valid, placements: ["header" as never] })).toThrow();
  });
});
