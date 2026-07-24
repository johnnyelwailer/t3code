import { describe, expect, it } from "vite-plus/test";

import {
  calculateT3TeamContextCacheBudget,
  isT3TeamContextCacheSoftPressure,
} from "./t3team-context-cache-budget.ts";

describe("t3team context cache budget", () => {
  it("keeps a reserve floor and uses half of free space above reserve", () => {
    const result = calculateT3TeamContextCacheBudget({
      totalBytes: 1_000,
      freeBytes: 500,
      reserveBytesOverride: 200,
    });

    expect(result).toEqual({
      totalBytes: 1_000,
      freeBytes: 500,
      reserveBytes: 200,
      softBudgetBytes: 150,
      hardStop: false,
    });
  });

  it("hard-stops background work at reserve", () => {
    expect(
      calculateT3TeamContextCacheBudget({
        totalBytes: 1_000,
        freeBytes: 200,
        reserveBytesOverride: 200,
      }).hardStop,
    ).toBe(true);
  });

  it("flags soft pressure when cache bytes exceed soft budget", () => {
    const budget = calculateT3TeamContextCacheBudget({
      totalBytes: 1_000,
      freeBytes: 500,
      reserveBytesOverride: 200,
    });
    expect(isT3TeamContextCacheSoftPressure({ budget, cacheBytes: budget.softBudgetBytes })).toBe(
      true,
    );
    expect(
      isT3TeamContextCacheSoftPressure({ budget, cacheBytes: budget.softBudgetBytes - 1 }),
    ).toBe(false);
  });
});
