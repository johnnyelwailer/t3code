import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  DEFAULT_RESOURCE_PRESSURE_THRESHOLDS,
  ResourcePressureThresholds,
} from "./t3team-resourcePressureSettings.ts";

const decode = Schema.decodeSync(ResourcePressureThresholds);
const valid = Schema.is(ResourcePressureThresholds);

describe("resource pressure settings", () => {
  it("defaults old settings to scaled headroom", () => {
    expect(decode({})).toEqual(DEFAULT_RESOURCE_PRESSURE_THRESHOLDS);
  });
  it("rejects inverted thresholds and invalid numbers", () => {
    expect(valid({ ...DEFAULT_RESOURCE_PRESSURE_THRESHOLDS, criticalAvailableGiB: 7 })).toBe(false);
    expect(valid({ ...DEFAULT_RESOURCE_PRESSURE_THRESHOLDS, criticalRamPercent: 20 })).toBe(false);
    expect(valid({ ...DEFAULT_RESOURCE_PRESSURE_THRESHOLDS, recoveryGiB: Number.NaN })).toBe(false);
  });
  it("defaults the notice thresholds to the shipped levels", () => {
    expect(decode({})).toMatchObject({
      noticeUsageWarnPercent: 80,
      noticeUsageCriticalPercent: 95,
      noticeProcessCpuPercent: 80,
      noticeProcessRssWarnGiB: 2,
      noticeProcessRssCriticalGiB: 4,
      noticeHostCpuPercent: 90,
      noticeQuietMinutes: 5,
    });
  });
  it("rejects notice warning levels at or above their critical levels", () => {
    const base = DEFAULT_RESOURCE_PRESSURE_THRESHOLDS;
    expect(valid({ ...base, noticeUsageWarnPercent: 95 })).toBe(false);
    expect(valid({ ...base, noticeProcessRssWarnGiB: 4 })).toBe(false);
    expect(valid({ ...base, noticeUsageWarnPercent: 50, noticeUsageCriticalPercent: 60 })).toBe(
      true,
    );
  });
  it("rejects out-of-range notice values", () => {
    const base = DEFAULT_RESOURCE_PRESSURE_THRESHOLDS;
    expect(valid({ ...base, noticeQuietMinutes: 0 })).toBe(false);
    expect(valid({ ...base, noticeHostCpuPercent: 101 })).toBe(false);
  });
});
