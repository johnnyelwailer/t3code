import { describe, expect, it } from "vite-plus/test";

import { clampDragOffset, lookAtAngles, smoothToward } from "./t3team-modelStageMath";

const DEG = Math.PI / 180;

describe("lookAtAngles", () => {
  it("is neutral at the head and follows the pointer's side", () => {
    expect(lookAtAngles(0, 0)).toEqual({ yaw: 0, pitch: 0 });
    const right = lookAtAngles(200, -100);
    expect(right.yaw).toBeGreaterThan(0);
    expect(right.pitch).toBeLessThan(0); // above: looks up
    expect(lookAtAngles(-200, 100).yaw).toBeLessThan(0);
  });

  it("never passes the clamps, however far the pointer is", () => {
    const limits = { maxYawDeg: 40, maxPitchDeg: 20, reachPx: 300 };
    for (const d of [1e3, 1e5, -1e6]) {
      const { yaw, pitch } = lookAtAngles(d, d, limits);
      expect(Math.abs(yaw)).toBeLessThanOrEqual(40 * DEG);
      expect(Math.abs(pitch)).toBeLessThanOrEqual(20 * DEG);
    }
    expect(lookAtAngles(1e6, 0, limits).yaw).toBeCloseTo(40 * DEG, 6);
  });
});

describe("smoothToward", () => {
  it("eases independent of frame rate and never overshoots", () => {
    const one = smoothToward(0, 1, 0.1);
    let two = smoothToward(0, 1, 0.05);
    two = smoothToward(two, 1, 0.05);
    expect(one).toBeCloseTo(two, 9);
    expect(smoothToward(0, 1, 10)).toBeLessThanOrEqual(1);
    expect(smoothToward(0.5, 1, 0)).toBe(0.5);
  });
});

describe("clampDragOffset", () => {
  const rest = { left: 100, top: 100, width: 120, height: 120 };
  const bounds = { left: 0, top: 0, width: 600, height: 400 };

  it("passes offsets inside the bounds through", () => {
    expect(clampDragOffset({ x: 50, y: -40 }, rest, bounds)).toEqual({ x: 50, y: -40 });
  });

  it("keeps every edge of the stage inside the bounds", () => {
    expect(clampDragOffset({ x: -999, y: -999 }, rest, bounds)).toEqual({ x: -100, y: -100 });
    expect(clampDragOffset({ x: 999, y: 999 }, rest, bounds)).toEqual({ x: 380, y: 180 });
  });

  it("pins the stage at rest when the bounds are smaller than it", () => {
    const tiny = { left: 100, top: 100, width: 60, height: 60 };
    expect(clampDragOffset({ x: 30, y: 30 }, rest, tiny)).toEqual({ x: 0, y: 0 });
  });
});
