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
});
