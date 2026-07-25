import { describe, expect, it } from "vite-plus/test";

import {
  areT3TeamDashboardRecipeViewSummariesEqual,
  clearT3TeamDashboardRecipeViewSummary,
  mergeT3TeamDashboardRecipeViewSummary,
} from "~/t3team/t3team-dashboardRecipeViewContext";
import type { T3TeamDashboardRecipeCurrentViewSummary } from "~/t3team/t3team-dashboardRecipeSummary";

function createSummary(
  overrides: Partial<T3TeamDashboardRecipeCurrentViewSummary> = {},
): T3TeamDashboardRecipeCurrentViewSummary {
  return {
    itemCount: 3,
    bugCount: 1,
    primaryItemLabel: "IES-100",
    primaryBugLabel: "IES-101",
    needsMyActionPreset: "review",
    needsMyActionCount: 1,
    ...overrides,
  };
}

describe("t3team-dashboardRecipeViewContext", () => {
  it("treats equal summaries as equal even when recreated", () => {
    expect(areT3TeamDashboardRecipeViewSummariesEqual(createSummary(), createSummary())).toBe(true);
  });

  it("preserves the current summary reference when published values are unchanged", () => {
    const current = createSummary();
    const next = createSummary();

    expect(mergeT3TeamDashboardRecipeViewSummary(current, next)).toBe(current);
  });

  it("clears the published summary on unmount only when it still owns the current value", () => {
    const published = createSummary();
    const current = createSummary();

    expect(clearT3TeamDashboardRecipeViewSummary(current, published)).toBeNull();
    expect(
      clearT3TeamDashboardRecipeViewSummary(
        createSummary({ itemCount: 4, primaryItemLabel: "IES-102" }),
        published,
      ),
    ).toMatchObject({ itemCount: 4, primaryItemLabel: "IES-102" });
  });
});
