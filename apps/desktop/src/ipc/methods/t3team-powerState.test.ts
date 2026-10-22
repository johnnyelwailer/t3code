import { describe, expect, it } from "vite-plus/test";

import { isLowPower } from "./t3team-powerState.ts";

describe("isLowPower", () => {
  it("is false for a cool, unthrottled machine", () => {
    expect(isLowPower("nominal", 100)).toBe(false);
    expect(isLowPower("fair", 100)).toBe(false);
    expect(isLowPower("unknown", 100)).toBe(false);
  });

  it("is true when the OS reports serious or critical thermal pressure", () => {
    expect(isLowPower("serious", 100)).toBe(true);
    expect(isLowPower("critical", 100)).toBe(true);
  });

  it("is true when the CPU is held under half speed", () => {
    expect(isLowPower("nominal", 49)).toBe(true);
    expect(isLowPower("nominal", 50)).toBe(false);
  });
});
