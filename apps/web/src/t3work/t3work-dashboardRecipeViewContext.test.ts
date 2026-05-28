import { describe, expect, it } from "vitest";

import {
  areT3workDashboardRecipeViewSummariesEqual,
  clearT3workDashboardRecipeViewSummary,
  mergeT3workDashboardRecipeViewSummary,
} from "~/t3work/t3work-dashboardRecipeViewContext";
import type { T3workDashboardRecipeCurrentViewSummary } from "~/t3work/t3work-dashboardRecipeSummary";

function createSummary(
  overrides: Partial<T3workDashboardRecipeCurrentViewSummary> = {},
): T3workDashboardRecipeCurrentViewSummary {
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

describe("t3work-dashboardRecipeViewContext", () => {
  it("treats equal summaries as equal even when recreated", () => {
    expect(areT3workDashboardRecipeViewSummariesEqual(createSummary(), createSummary())).toBe(true);
  });

  it("preserves the current summary reference when published values are unchanged", () => {
    const current = createSummary();
    const next = createSummary();

    expect(mergeT3workDashboardRecipeViewSummary(current, next)).toBe(current);
  });

  it("clears the published summary on unmount only when it still owns the current value", () => {
    const published = createSummary();
    const current = createSummary();

    expect(clearT3workDashboardRecipeViewSummary(current, published)).toBeNull();
    expect(
      clearT3workDashboardRecipeViewSummary(
        createSummary({ itemCount: 4, primaryItemLabel: "IES-102" }),
        published,
      ),
    ).toMatchObject({ itemCount: 4, primaryItemLabel: "IES-102" });
  });
});
