import { describe, expect, it } from "vitest";

import {
  cloudSessionBindBannerTitle,
  cloudSessionSelectValue,
  parseCloudSessionSelectValue,
  resolveCloudSessionBindPhase,
} from "./t3team-cloudSessionTargetLogic";

describe("cloudSessionTargetLogic", () => {
  it("round-trips the optimistic select sentinel", () => {
    expect(parseCloudSessionSelectValue(cloudSessionSelectValue("s-1"))).toBe("s-1");
    expect(parseCloudSessionSelectValue("env-local")).toBeNull();
  });

  it("names bind phases for the composer banner", () => {
    expect(cloudSessionBindBannerTitle("provisioning")).toContain("Provisioning");
    expect(cloudSessionBindBannerTitle("connecting")).toContain("Connecting");
    expect(
      resolveCloudSessionBindPhase({
        sessionPhase: "preparing",
        connecting: false,
        projectReady: false,
        flushing: false,
        failed: false,
      }),
    ).toBe("provisioning");
    expect(
      resolveCloudSessionBindPhase({
        sessionPhase: "ready",
        connecting: true,
        projectReady: false,
        flushing: false,
        failed: false,
      }),
    ).toBe("connecting");
  });
});
