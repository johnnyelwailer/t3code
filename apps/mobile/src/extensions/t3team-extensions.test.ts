import { describe, expect, it } from "vite-plus/test";

import { mobileExtensions } from "./t3team-extensions";

describe("mobileExtensions", () => {
  it("fills no slot in a build without an overlay, so every screen keeps its stock behavior", () => {
    expect(mobileExtensions).toEqual({});
    expect(mobileExtensions.homeEmptyState).toBeUndefined();
    expect(mobileExtensions.connectionsNewTop).toBeUndefined();
  });
});
