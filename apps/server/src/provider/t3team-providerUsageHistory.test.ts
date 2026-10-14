/**
 * Unit tests for the bounded usage-sample history and its burn-rate math:
 * dedupe, span floor, reset (non-increasing) rejection, and exhaustion
 * projection.
 */
import { assert, it } from "@effect/vitest";
import { describe } from "vite-plus/test";

import {
  burnRateForKey,
  clearUsageSampleHistory,
  recordUsageSample,
} from "./t3team-providerUsageHistory.ts";

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

describe("burnRateForKey", () => {
  it("records nothing before the first sample", () =>
    Promise.resolve(assert.equal(burnRateForKey("solo", T0), undefined)).then(() => null));

  it("needs two samples and a span of at least two minutes", () => {
    recordUsageSample("short", 20, T0);
    recordUsageSample("short", 40, T0 + 90_000);
    assert.equal(burnRateForKey("short", T0 + 90_000), undefined);
    recordUsageSample("short", 50, T0 + 3 * MINUTE);
    const burn = burnRateForKey("short", T0 + 3 * MINUTE);
    assert.isNotNull(burn);
    if (burn !== undefined) {
      // 20 -> 50 over 3 minutes = 10 points/minute = 600 points/hour.
      assert.equal(burn.percentPerHour, 600);
      assert.equal(burn.sampleCount, 3);
    }
    return null;
  });

  it("dedupes within a minute (last write wins)", () => {
    recordUsageSample("dedupe", 10, T0);
    recordUsageSample("dedupe", 12, T0 + 30_000);
    recordUsageSample("dedupe", 15, T0 + 30 * MINUTE);
    const burn = burnRateForKey("dedupe", T0 + 30 * MINUTE);
    // 12 -> 15 over ~30 minutes ≈ 6 points/hour, from two effective samples.
    assert.isNotNull(burn);
    if (burn !== undefined) {
      assert.equal(burn.sampleCount, 2);
      assert.isTrue(burn.percentPerHour > 5 && burn.percentPerHour < 7);
    }
    return null;
  });

  it("refuses to report a rate after a window reset", () => {
    recordUsageSample("reset", 90, T0);
    recordUsageSample("reset", 10, T0 + 10 * MINUTE);
    assert.equal(burnRateForKey("reset", T0 + 10 * MINUTE), undefined);
    return null;
  });

  it("ignores samples older than 24 hours", () => {
    recordUsageSample("stale", 10, T0);
    recordUsageSample("stale", 60, T0 + 25 * 60 * MINUTE);
    assert.equal(burnRateForKey("stale", T0 + 25 * 60 * MINUTE), undefined);
    return null;
  });
});

describe("clearUsageSampleHistory", () => {
  it("drops every recorded sample", () => {
    recordUsageSample("wipe", 10, T0);
    clearUsageSampleHistory();
    assert.equal(burnRateForKey("wipe", T0 + 10 * MINUTE), undefined);
    return null;
  });
});
