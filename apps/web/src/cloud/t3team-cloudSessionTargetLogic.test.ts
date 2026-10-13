import { describe, expect, it } from "vite-plus/test";

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
        machineRegistered: false,
        projectReady: false,
        flushing: false,
        failed: false,
      }),
    ).toBe("provisioning");
    expect(
      resolveCloudSessionBindPhase({
        sessionPhase: "ready",
        connecting: true,
        machineRegistered: false,
        projectReady: false,
        flushing: false,
        failed: false,
      }),
    ).toBe("connecting");
  });

  it("keeps connecting until the machine is registered, then syncs the project (408)", () => {
    const ready = {
      sessionPhase: "ready",
      connecting: false,
      projectReady: false,
      flushing: false,
      failed: false,
    } as const;
    // Ready but its environment has not reported in yet: that is connecting, not a project gap.
    expect(resolveCloudSessionBindPhase({ ...ready, machineRegistered: false })).toBe("connecting");
    expect(resolveCloudSessionBindPhase({ ...ready, machineRegistered: true })).toBe("syncing");
    expect(
      resolveCloudSessionBindPhase({ ...ready, machineRegistered: true, projectReady: true }),
    ).toBe("connecting");
  });
});
