import { describe, expect, it } from "vite-plus/test";

import { SilenceAutoStop } from "./autoSend.ts";

describe("SilenceAutoStop", () => {
  it("never fires in manual mode", () => {
    const autoStop = new SilenceAutoStop("manual");
    autoStop.prime(0);
    expect(autoStop.observe(0, 10_000)).toBe(false);
    expect(autoStop.observe(0, 99_000)).toBe(false);
  });

  it("resets the silence clock while audio is present", () => {
    const autoStop = new SilenceAutoStop("auto");
    autoStop.prime(0);
    // Speech keeps the clock current...
    expect(autoStop.observe(0.5, 2000)).toBe(false);
    expect(autoStop.observe(0.1, 4000)).toBe(false);
    // ...so 3 s of silence is measured from the LAST audio, not the start.
    expect(autoStop.observe(0, 6999)).toBe(false);
    expect(autoStop.observe(0, 7000)).toBe(true);
  });

  it("applies mode changes immediately", () => {
    const autoStop = new SilenceAutoStop("auto");
    autoStop.prime(0);
    expect(autoStop.observe(0.5, 1000)).toBe(false);
    autoStop.setMode("manual");
    expect(autoStop.observe(0, 10_000)).toBe(false);
    autoStop.setMode("auto");
    expect(autoStop.observe(0, 13_000)).toBe(true);
  });

  it("stays silent for energy at or above the threshold", () => {
    const autoStop = new SilenceAutoStop("auto");
    autoStop.prime(0);
    // 0.02 is the silence threshold; anything at/above counts as audio.
    expect(autoStop.observe(0.02, 4000)).toBe(false);
    expect(autoStop.observe(0.5, 9000)).toBe(false);
  });
});
