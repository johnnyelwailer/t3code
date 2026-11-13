// @effect-diagnostics nodeBuiltinImport:off - boot-hook tests write a temp home and a real ownership lock.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import { resolveUserDataPath } from "../app/DesktopUserData.ts";
import { serverOwnerLockPath } from "./t3team-oldAppPaths.ts";
import { detectInputFromEnvironment, oldAppIsRunningOnHome } from "./t3team-oldAppGuardBoot.ts";

const holdLock = (home: string) => {
  NodeFS.mkdirSync(NodePath.join(home, "userdata"), { recursive: true });
  const db = new NodeSqlite.DatabaseSync(serverOwnerLockPath(home, NodePath.join));
  db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;");
  return {
    release: () => {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // closed
      }
      db.close();
    },
  };
};

describe("old-app guard boot hooks", () => {
  it("detects Windows homes and userData dirs from the environment", () => {
    const join = NodePath.win32.join;
    const homeDirectory = join("C:\\", "Users", "Phil");
    const appData = join(homeDirectory, "AppData", "Roaming");
    const input = detectInputFromEnvironment({
      baseDir: join(appData, "nexi-work"),
      homeDirectory,
      appDataDirectory: appData,
      platform: "win32",
      path: { join },
      isDevelopment: false,
      isolatedInstance: true,
      displayName: "Nexi Work",
      userDataDirName: "nexi-work",
      legacyUserDataDirName: "T3 Code (Alpha)",
      isolatedProfileDir: undefined,
    });
    assert.ok(input.homes.includes(join(appData, "nexi-work")));
    assert.ok(input.homes.includes(join(homeDirectory, ".t3")));
    assert.ok(input.userDataDirs.includes(join(appData, "t3code-v2")));
    assert.ok(input.userDataDirs.includes(join(appData, "T3 Code (Alpha)")));
    assert.equal(
      oldAppIsRunningOnHome({
        baseDir: join(appData, "fresh-home"),
        homeDirectory,
        appDataDirectory: appData,
        platform: "win32",
        path: { join },
        isDevelopment: false,
        isolatedInstance: true,
        displayName: "Nexi Work",
        isolatedProfileDir: undefined,
        legacyUserDataDirName: undefined,
        userDataDirName: undefined,
      }),
      false,
    );
  });

  it.effect("does not copy a Chromium profile while the daily app holds the home", () =>
    Effect.gen(function* () {
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "old-app-profile-"));
      try {
        const appData = NodePath.join(root, "appdata");
        const home = NodePath.join(appData, "nexi-work");
        const isolatedProfile = NodePath.join(home, "electron-profile");
        const source = NodePath.join(appData, "t3code-v2");
        NodeFS.mkdirSync(source, { recursive: true });
        NodeFS.writeFileSync(NodePath.join(source, "Local State"), '{"os_crypt":{}}');
        NodeFS.writeFileSync(NodePath.join(source, "Cookies"), "cookies");
        const held = holdLock(home);
        try {
          const resolved = yield* resolveUserDataPath({
            appDataDirectory: appData,
            isDevelopment: false,
            platform: "darwin",
            isolatedProfileDir: isolatedProfile,
          });
          assert.equal(resolved, isolatedProfile);
          assert.equal(NodeFS.existsSync(NodePath.join(isolatedProfile, "Local State")), false);
          assert.equal(
            oldAppIsRunningOnHome({
              baseDir: home,
              homeDirectory: NodePath.join(root, "user"),
              appDataDirectory: appData,
              platform: "darwin",
              path: { join: NodePath.join },
              isDevelopment: false,
              isolatedInstance: true,
              displayName: "Nexi Work",
              isolatedProfileDir: isolatedProfile,
              legacyUserDataDirName: undefined,
              userDataDirName: undefined,
            }),
            true,
          );
        } finally {
          held.release();
        }
      } finally {
        NodeFS.rmSync(root, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
