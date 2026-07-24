import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectDashboardModeRouteSearch,
  parseProjectDashboardModeRouteSearch,
  resolveProjectDashboardModeState,
  stripProjectDashboardModeSearchParams,
} from "./t3team-projectDashboardModeState";

describe("project dashboard mode state", () => {
  it("defaults to my work and lets route search override persisted state", () => {
    expect(resolveProjectDashboardModeState({})).toEqual({
      dashboardMode: "my-work",
    });

    const persisted = {
      dashboardMode: "my-work",
    } as const;

    const search = parseProjectDashboardModeRouteSearch({ projectView: "backlog" });

    expect(resolveProjectDashboardModeState({ persisted, search })).toEqual({
      dashboardMode: "backlog",
    });
  });

  it("builds deterministic route search values from the current dashboard mode", () => {
    expect(
      buildProjectDashboardModeRouteSearch({
        dashboardMode: "backlog",
      }),
    ).toEqual({
      projectView: "backlog",
    });
  });

  it("strips dashboard mode query params while preserving unrelated search params", () => {
    expect(
      stripProjectDashboardModeSearchParams({
        projectView: "my-work",
        unrelated: "keep-me",
      }),
    ).toEqual({ unrelated: "keep-me" });
  });
});
