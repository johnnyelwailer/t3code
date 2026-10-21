import { describe, expect, it } from "vite-plus/test";

import {
  frameIntervalMs,
  type ModelStageSignals,
  probeMeanMs,
  selectModelStageTier,
} from "./t3team-modelStageTier";

const desk: ModelStageSignals = {
  reducedMotion: false,
  battery: null,
  power: null,
  probeMs: {},
  webgl: true,
  hasLoop: true,
};
const tier = (
  signals: Partial<ModelStageSignals>,
  quality?: Parameters<typeof selectModelStageTier>[1],
) => selectModelStageTier({ ...desk, ...signals }, quality).tier;

describe("selectModelStageTier", () => {
  it("renders full with nothing against it", () => {
    expect(selectModelStageTier(desk)).toEqual({ tier: "full", reasons: [] });
  });

  it("shows the still under reduced motion, whatever else is true", () => {
    expect(tier({ reducedMotion: true })).toBe("still");
    expect(
      tier({ reducedMotion: true, power: { onBattery: false, lowPower: false } }, "full"),
    ).toBe("still");
  });

  it("steps down to low on battery, and to minimal in low-power mode", () => {
    expect(tier({ power: { onBattery: true, lowPower: false } })).toBe("low");
    expect(tier({ power: { onBattery: false, lowPower: true } })).toBe("minimal");
    expect(tier({ power: { onBattery: true, lowPower: true } })).toBe("minimal");
  });

  it("stops WebGL below 20% battery while discharging, not while charging", () => {
    expect(tier({ battery: { charging: false, level: 0.15 } })).toBe("minimal");
    expect(tier({ battery: { charging: true, level: 0.15 } })).toBe("full");
    expect(tier({ battery: { charging: false, level: 0.5 } })).toBe("full");
  });

  it("drops one tier when the first frames were slow, and again if the next tier was too", () => {
    expect(tier({ probeMs: { full: 9 } })).toBe("full");
    expect(tier({ probeMs: { full: 14 } })).toBe("low");
    expect(tier({ probeMs: { full: 14, low: 8 } })).toBe("low");
    expect(tier({ probeMs: { full: 14, low: 13 } })).toBe("minimal");
    // A probe only judges the tier it timed.
    expect(tier({ probeMs: { low: 30 } })).toBe("full");
  });

  it("uses the still when the minimal tier has no loop, or WebGL is missing without one", () => {
    expect(tier({ webgl: false })).toBe("minimal");
    expect(tier({ webgl: false, hasLoop: false })).toBe("still");
    expect(tier({}, "minimal")).toBe("minimal");
    expect(tier({ hasLoop: false }, "minimal")).toBe("still");
  });

  it("treats quality as a ceiling, never a floor", () => {
    expect(tier({}, "low")).toBe("low");
    expect(tier({}, "still")).toBe("still");
    expect(tier({ power: { onBattery: false, lowPower: true } }, "full")).toBe("minimal");
    expect(tier({ power: { onBattery: true, lowPower: false } }, "full")).toBe("low");
  });

  it("says why it is not full", () => {
    expect(
      selectModelStageTier({ ...desk, power: { onBattery: true, lowPower: false } }).reasons,
    ).toEqual(["on battery"]);
    expect(selectModelStageTier({ ...desk, probeMs: { full: 20 } }).reasons).toEqual([
      "slow frames at full (20.0 ms)",
    ]);
  });
});

describe("probeMeanMs", () => {
  it("waits for enough frames and skips the first (compile) frames", () => {
    expect(probeMeanMs([100, 100, 100, 5, 5])).toBeNull();
    expect(probeMeanMs([100, 100, 100, ...Array.from({ length: 20 }, () => 6)])).toBe(6);
  });
});

describe("frameIntervalMs", () => {
  it("caps full at 60 fps and low at 30", () => {
    expect(frameIntervalMs("full")).toBeCloseTo(16.67, 1);
    expect(frameIntervalMs("low")).toBeCloseTo(33.33, 1);
  });
});
