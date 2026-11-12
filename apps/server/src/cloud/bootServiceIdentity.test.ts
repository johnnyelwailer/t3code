import { describe, expect, it } from "@effect/vitest";

import {
  BOOT_SERVICE_IDENTITY_ENV,
  NEXI_LIVE_APP_ID,
  UPSTREAM_BOOT_SERVICE_LAUNCHD_LABEL,
  UPSTREAM_BOOT_SERVICE_UNIT_FILE,
  bootServiceIdentityForAppId,
  resolveBootServiceIdentity,
} from "./bootServiceIdentity.ts";

describe("bootServiceIdentityForAppId", () => {
  it("gives live Nexi Work unique launchd and systemd labels", () => {
    const live = bootServiceIdentityForAppId(NEXI_LIVE_APP_ID);
    expect(live.launchdLabel).toBe("ch.nexplore.nexi.work.service");
    expect(live.plistFile).toBe("ch.nexplore.nexi.work.service.plist");
    expect(live.unitFile).toBe("nexi-work.service");
    expect(live.name).toBe("nexi-work");
    expect(live.description).toBe("Nexi Work server");
    expect(live.appId).toBe(NEXI_LIVE_APP_ID);
  });

  it("gives a nightly a label that does not collide with live", () => {
    const nightly = bootServiceIdentityForAppId("ch.nexplore.nexi.work.nightly");
    expect(nightly.launchdLabel).toBe("ch.nexplore.nexi.work.nightly.service");
    expect(nightly.unitFile).toBe("nexi-work-nightly.service");
    expect(nightly.unitFile).not.toBe(bootServiceIdentityForAppId(NEXI_LIVE_APP_ID).unitFile);
    expect(nightly.launchdLabel).not.toBe(
      bootServiceIdentityForAppId(NEXI_LIVE_APP_ID).launchdLabel,
    );
  });

  it("leaves an upstream appId on the t3code labels", () => {
    const upstream = bootServiceIdentityForAppId("com.t3tools.t3code");
    expect(upstream.unitFile).toBe(UPSTREAM_BOOT_SERVICE_UNIT_FILE);
    expect(upstream.launchdLabel).toBe(UPSTREAM_BOOT_SERVICE_LAUNCHD_LABEL);
    expect(upstream.appId).toBeUndefined();
  });
});

describe("resolveBootServiceIdentity", () => {
  it("defaults to upstream when no Nexi identity is in the environment", () => {
    const identity = resolveBootServiceIdentity({});
    expect(identity.unitFile).toBe(UPSTREAM_BOOT_SERVICE_UNIT_FILE);
    expect(identity.launchdLabel).toBe(UPSTREAM_BOOT_SERVICE_LAUNCHD_LABEL);
  });

  it("resolves from the packaged app id", () => {
    const identity = resolveBootServiceIdentity({ T3CODE_DESKTOP_APP_ID: NEXI_LIVE_APP_ID });
    expect(identity.unitFile).toBe("nexi-work.service");
    expect(identity.launchdLabel).toBe("ch.nexplore.nexi.work.service");
  });

  it("prefers the dedicated identity env over a conflicting app id", () => {
    const identity = resolveBootServiceIdentity({
      [BOOT_SERVICE_IDENTITY_ENV]: "ch.nexplore.nexi.work.nightly",
      T3CODE_DESKTOP_APP_ID: NEXI_LIVE_APP_ID,
    });
    expect(identity.unitFile).toBe("nexi-work-nightly.service");
  });

  it("does not treat T3_BOOT_SERVICE_UNIT as an identity", () => {
    const identity = resolveBootServiceIdentity({ T3_BOOT_SERVICE_UNIT: "nexi-work.service" });
    expect(identity.unitFile).toBe(UPSTREAM_BOOT_SERVICE_UNIT_FILE);
  });
});
