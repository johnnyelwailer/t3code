import { describe, expect, it } from "vite-plus/test";

import { groundShadowCssOpacity } from "./t3team-modelStageShadow";

describe("groundShadowCssOpacity", () => {
  it("is opaque on the ground and fades while airborne", () => {
    expect(groundShadowCssOpacity(null, true)).toBe(0.45);
    expect(groundShadowCssOpacity({ lift: 0 }, true)).toBe(0.45);
    expect(groundShadowCssOpacity({ lift: 0.35 }, true)).toBe(0);
    expect(groundShadowCssOpacity({ lift: 0.175 }, true)).toBeCloseTo(0.225, 3);
    expect(groundShadowCssOpacity({ lift: 0.28 }, false)).toBe(0);
  });
});
