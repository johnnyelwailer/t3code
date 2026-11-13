// @effect-diagnostics nodeBuiltinImport:off - path tests use Node path.win32 and path.posix joins.
import { assert, describe, it } from "@effect/vitest";
import * as NodePath from "node:path";

import {
  appDataDirectoryForPlatform,
  electronSingletonLockPath,
  legacyT3Home,
  oldAppUserDataDirs,
  serverOwnerLockPath,
  serverRuntimeStatePath,
  windowsRoamingAppData,
  OLD_NEXI_APP_IDS,
} from "./t3team-oldAppPaths.ts";

describe("old-app paths", () => {
  it("uses Windows roaming app data and userdata lock paths", () => {
    const join = NodePath.win32.join;
    const home = join("C:\\", "Users", "Phil");
    const appData = windowsRoamingAppData(home, join);
    assert.equal(appData, join("C:\\", "Users", "Phil", "AppData", "Roaming"));
    assert.equal(
      appDataDirectoryForPlatform({ platform: "win32", homeDirectory: home, join }),
      appData,
    );
    const nexiHome = join(appData, "nexi-work");
    assert.equal(
      serverOwnerLockPath(nexiHome, join),
      join(nexiHome, "userdata", "server-owner.sqlite"),
    );
    assert.equal(
      serverRuntimeStatePath(nexiHome, join),
      join(nexiHome, "userdata", "server-runtime.json"),
    );
    assert.equal(legacyT3Home(home, join), join(home, ".t3"));
    const dirs = oldAppUserDataDirs({ appDataDirectory: appData, join });
    assert.ok(dirs.includes(join(appData, "t3code-v2")));
    assert.ok(dirs.includes(join(appData, "nexi-work")));
    assert.equal(electronSingletonLockPath(dirs[0]!, join), join(dirs[0]!, "SingletonLock"));
  });

  it("uses macOS Application Support and Linux config homes", () => {
    const join = NodePath.posix.join;
    assert.equal(
      appDataDirectoryForPlatform({ platform: "darwin", homeDirectory: "/Users/phil", join }),
      "/Users/phil/Library/Application Support",
    );
    assert.equal(
      appDataDirectoryForPlatform({ platform: "linux", homeDirectory: "/home/phil", join }),
      "/home/phil/.config",
    );
    assert.equal(
      appDataDirectoryForPlatform({
        platform: "linux",
        homeDirectory: "/home/phil",
        join,
        xdgConfigHome: "/custom/config",
      }),
      "/custom/config",
    );
  });
});

describe("old Nexi app identities", () => {
  it("names the daily app bundle ids that must not be treated as this process", () => {
    assert.ok(OLD_NEXI_APP_IDS.includes("com.t3tools.t3code"));
  });
});
