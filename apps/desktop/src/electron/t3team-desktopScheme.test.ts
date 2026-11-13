import { assert, describe, it } from "@effect/vitest";

import * as ElectronProtocol from "./ElectronProtocol.ts";
import {
  NEXI_WORK_SCHEME,
  getDesktopScheme,
  getDesktopUrl,
  isolatedDesktopSchemePrivileges,
} from "./t3team-desktopScheme.ts";

describe("getDesktopScheme", () => {
  it("uses nexi-work for an isolated instance and the upstream schemes otherwise", () => {
    assert.equal(getDesktopScheme(false), "t3code");
    assert.equal(getDesktopScheme(true), "t3code-dev");
    assert.equal(getDesktopScheme(false, { isolatedInstance: true }), "nexi-work");
    assert.equal(getDesktopScheme(true, { isolatedInstance: true }), "nexi-work");
    assert.equal(getDesktopUrl(false, { isolatedInstance: true }), "nexi-work://app/");
    assert.equal(getDesktopUrl(false), "t3code://app/");
    assert.equal(getDesktopScheme(false), ElectronProtocol.getDesktopScheme(false));
    assert.equal(getDesktopScheme(true), ElectronProtocol.getDesktopScheme(true));
    assert.equal(getDesktopUrl(false), ElectronProtocol.getDesktopUrl(false));
  });

  it("registers nexi-work as a privileged scheme", () => {
    const entries = isolatedDesktopSchemePrivileges();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.scheme, NEXI_WORK_SCHEME);
    assert.isTrue(entries[0]?.privileges.standard);
    assert.isTrue(entries[0]?.privileges.codeCache);
  });
});
