import { describe, expect, it } from "vite-plus/test";

import {
  calculateT3workContextCacheBudget,
  isT3workContextCacheSoftPressure,
} from "./t3work-context-cache-budget.ts";

describe("t3work context cache budget", () => {
  it("keeps a reserve floor and uses half of free space above reserve", () => {
    const result = calculateT3workContextCacheBudget({
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
      calculateT3workContextCacheBudget({
        totalBytes: 1_000,
        freeBytes: 200,
        reserveBytesOverride: 200,
      }).hardStop,
    ).toBe(true);
  });

  it("flags soft pressure when cache bytes exceed soft budget", () => {
    const budget = calculateT3workContextCacheBudget({
      totalBytes: 1_000,
      freeBytes: 500,
      reserveBytesOverride: 200,
    });
    expect(isT3workContextCacheSoftPressure({ budget, cacheBytes: budget.softBudgetBytes })).toBe(
      true,
    );
    expect(
      isT3workContextCacheSoftPressure({ budget, cacheBytes: budget.softBudgetBytes - 1 }),
    ).toBe(false);
  });
});
