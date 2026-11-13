import { assert, describe, it } from "@effect/vitest";

import { DEFAULT_DESKTOP_APP_ID } from "./t3team-releaseFlavor.ts";
import {
  renderLinuxMetainfoXml,
  resolveLinuxPackagingIdentity,
  UPSTREAM_LINUX_EXECUTABLE_NAME,
  UPSTREAM_LINUX_METAINFO_ID,
} from "./t3team-linuxPackagingIdentity.ts";

describe("resolveLinuxPackagingIdentity", () => {
  it("keeps upstream Linux identity for an unbranded build", () => {
    const identity = resolveLinuxPackagingIdentity({ appId: DEFAULT_DESKTOP_APP_ID });
    assert.isFalse(identity.branded);
    assert.equal(identity.executableName, UPSTREAM_LINUX_EXECUTABLE_NAME);
    assert.equal(identity.startupWmClass, "t3code");
    assert.equal(identity.metainfoId, UPSTREAM_LINUX_METAINFO_ID);
    assert.equal(identity.desktopEntryName, "t3code.desktop");
    assert.equal(identity.docDir, "t3code");
  });

  it("derives Nexi Work identity from the product name and app id", () => {
    const identity = resolveLinuxPackagingIdentity({
      appId: "ch.nexplore.nexi.work",
      productNameOverride: "Nexi Work",
    });
    assert.isTrue(identity.branded);
    assert.equal(identity.executableName, "nexi-work");
    assert.equal(identity.startupWmClass, "nexi-work");
    assert.equal(identity.metainfoId, "ch.nexplore.nexi.work");
    assert.equal(identity.desktopEntryName, "nexi-work.desktop");
    assert.equal(identity.docDir, "nexi-work");
  });
});

describe("renderLinuxMetainfoXml", () => {
  it("writes the Nexi AppStream id, launchable and binary", () => {
    const xml = renderLinuxMetainfoXml({
      appId: "ch.nexplore.nexi.work",
      productName: "Nexi Work",
      executableName: "nexi-work",
      desktopEntryName: "nexi-work.desktop",
    });
    assert.include(xml, "<id>ch.nexplore.nexi.work</id>");
    assert.include(xml, "<name>Nexi Work</name>");
    assert.include(xml, '<launchable type="desktop-id">nexi-work.desktop</launchable>');
    assert.include(xml, "<binary>nexi-work</binary>");
    assert.notInclude(xml, "com.t3tools.t3code");
    assert.notInclude(xml, "<binary>t3code</binary>");
  });
});
