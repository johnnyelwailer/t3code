// @effect-diagnostics nodeBuiltinImport:off - the packaged branding is a real file under a temp resources dir.
import * as NodePathLayer from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import { resolveUserDataPath } from "./DesktopUserData.ts";

const APP_DATA = "/Users/alice/Library/Application Support";

const withBranding = (
  branding: Record<string, unknown>,
  env: Record<string, string> = {},
  platform: NodeJS.Platform = "darwin",
) => {
  const resourcesPath = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-branding-"));
  NodeFS.writeFileSync(
    NodePath.join(resourcesPath, "desktop-branding.json"),
    JSON.stringify(branding),
  );
  return DesktopEnvironment.DesktopEnvironment.pipe(
    Effect.provide(
      DesktopEnvironment.layer({
        dirname: "/repo/apps/desktop/dist-electron",
        homeDirectory: "/Users/alice",
        platform,
        processArch: "arm64",
        appVersion: "0.1.0",
        appPath: "/Applications/Nexi Work.app/Contents/Resources/app.asar",
        isPackaged: true,
        resourcesPath,
        runningUnderArm64Translation: false,
      }).pipe(
        Layer.provide(
          Layer.mergeAll(
            NodeServices.layer,
            NodePathLayer.layerPosix,
            DesktopConfig.layerTest(env),
          ),
        ),
      ),
    ),
    Effect.ensuring(
      Effect.sync(() => NodeFS.rmSync(resourcesPath, { recursive: true, force: true })),
    ),
  );
};

const installed = { baseName: "Nexi Work", displayName: "Nexi Work", userDataDirName: "nexi-work" };
const isolated = {
  baseName: "Nexi Work Nightly Dogfood",
  displayName: "Nexi Work Nightly Dogfood",
  userDataDirName: "nexi-work-nightly-dogfood",
  isolatedInstance: true,
};

describe("DesktopEnvironment isolated instance", () => {
  it.effect(
    "an installed (non-isolated) build keeps ~/.t3 state and the shared t3code-v2 profile",
    () =>
      Effect.gen(function* () {
        const environment = yield* withBranding(installed);
        assert.isFalse(environment.isolatedInstance);
        assert.isUndefined(environment.isolatedProfileDir);
        assert.equal(environment.baseDir, "/Users/alice/.t3");
        assert.equal(environment.stateDir, "/Users/alice/.t3/userdata");
        assert.equal(
          environment.desktopSettingsPath,
          "/Users/alice/.t3/userdata/desktop-settings.json",
        );
        const userData = yield* resolveUserDataPath(environment).pipe(
          Effect.provide(NodeServices.layer),
        );
        assert.equal(userData, `${APP_DATA}/t3code-v2`);
      }),
  );

  it.effect("an isolated build owns its app-data directory: state, settings and profile", () =>
    Effect.gen(function* () {
      const environment = yield* withBranding(isolated);
      const home = `${APP_DATA}/nexi-work-nightly-dogfood`;
      assert.isTrue(environment.isolatedInstance);
      assert.equal(environment.baseDir, home);
      assert.equal(environment.stateDir, `${home}/userdata`);
      assert.equal(environment.desktopSettingsPath, `${home}/userdata/desktop-settings.json`);
      assert.equal(environment.logDir, `${home}/userdata/logs`);
      assert.equal(environment.isolatedProfileDir, `${home}/electron-profile`);
      const userData = yield* resolveUserDataPath(environment).pipe(
        Effect.provide(NodeServices.layer),
      );
      assert.equal(userData, `${home}/electron-profile`);
    }),
  );

  it.effect(
    "an isolated build ignores an inherited T3CODE_HOME: the home is part of its identity",
    () =>
      Effect.gen(function* () {
        // A terminal inside the installed app exports its own T3CODE_HOME; launching the isolated
        // build from there must not move it onto the installed app's home.
        const environment = yield* withBranding(isolated, { T3CODE_HOME: "/Users/alice/.t3" });
        const home = `${APP_DATA}/nexi-work-nightly-dogfood`;
        assert.isTrue(environment.isolatedInstance);
        assert.equal(environment.baseDir, home);
        assert.equal(environment.stateDir, `${home}/userdata`);
      }),
  );

  it.effect("an installed build still honours an explicit T3CODE_HOME", () =>
    Effect.gen(function* () {
      const environment = yield* withBranding(installed, { T3CODE_HOME: "/ops/home" });
      assert.equal(environment.stateDir, "/ops/home/userdata");
    }),
  );

  it.effect("isolatedInstance without a userDataDirName fails instead of sharing ~/.t3", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(withBranding({ baseName: "X", isolatedInstance: true }));
      assert.isTrue(Exit.isFailure(exit));
      assert.match(String(exit), /no userDataDirName/u);
    }),
  );

  it.effect.each(["win32", "linux"] as const)(
    "an isolated build refuses to start on %s: only macOS is isolated",
    (platform) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(withBranding(isolated, {}, platform));
        assert.isTrue(Exit.isFailure(exit));
        assert.match(String(exit), /isolated instances are macOS-only/u);
      }),
  );
});
