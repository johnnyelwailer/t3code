// @effect-diagnostics nodeBuiltinImport:off - joins branded home paths in the early-startup fixture.
import * as NodePath from "node:path";

import { assert, describe, it } from "@effect/vitest";

import {
  resolveLinuxDesktopEntryName,
  resolveEarlyLinuxPasswordStorePreference,
  restoreEarlyLinuxDeviceScaleFactor,
} from "./DesktopEarlyElectronStartup.ts";
import {
  resolveBrandedLinuxDesktopEntryName,
  resolveEarlyDesktopBaseDir,
} from "./t3team-earlyPackagedBranding.ts";

describe("early Linux isolated home", () => {
  const joinPath = NodePath.posix.join;
  const isolated = {
    isolatedInstance: true as const,
    userDataDirName: "nexi-work",
    linuxDesktopEntryName: "nexi-work.desktop",
  };

  it("reads password-store and scale from the branded home, not ~/.t3", () => {
    const reads: string[] = [];
    const preference = resolveEarlyLinuxPasswordStorePreference({
      env: { T3CODE_HOME: "/home/user/.t3" },
      homeDirectory: "/home/user",
      joinPath,
      packagedBranding: isolated,
      readFileString: (path) => {
        reads.push(path);
        return JSON.stringify({ linuxPasswordStore: "kwallet6" });
      },
    });
    assert.equal(preference, "kwallet6");
    assert.deepEqual(reads, ["/home/user/.config/nexi-work/userdata/desktop-settings.json"]);
  });

  it("honours XDG_CONFIG_HOME and ignores an inherited T3CODE_HOME", () => {
    const { baseDir, isolated: isIsolated } = resolveEarlyDesktopBaseDir({
      env: { T3CODE_HOME: "/home/user/.t3", XDG_CONFIG_HOME: "/custom/config" },
      homeDirectory: "/home/user",
      joinPath,
      packagedBranding: isolated,
    });
    assert.isTrue(isIsolated);
    assert.equal(baseDir, "/custom/config/nexi-work");
  });

  it("uses the branded desktop entry name", () => {
    assert.equal(
      resolveBrandedLinuxDesktopEntryName(false, isolated, resolveLinuxDesktopEntryName(false)),
      "nexi-work.desktop",
    );
    assert.equal(resolveLinuxDesktopEntryName(false), "com.t3tools.T3Code.desktop");
    assert.equal(resolveLinuxDesktopEntryName(true), "com.t3tools.T3Code.Development.desktop");
  });

  it("persists the device scale factor under the branded home", () => {
    const writes: Array<[string, string]> = [];
    restoreEarlyLinuxDeviceScaleFactor({
      env: { T3CODE_HOME: "/home/user/.t3" },
      homeDirectory: "/home/user",
      joinPath,
      packagedBranding: isolated,
      commandLine: {
        hasSwitch: () => true,
        getSwitchValue: () => "1.5",
        appendSwitch: () => {},
      },
      readFileString: () => {
        throw new Error("should not read");
      },
      writeFileString: (path, value) => writes.push([path, value]),
    });
    assert.deepEqual(writes, [
      ["/home/user/.config/nexi-work/userdata/linux-device-scale-factor", "1.5"],
    ]);
  });
});
