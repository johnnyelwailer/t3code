import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";

import * as DesktopAssets from "./DesktopAssets.ts";
import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const environmentLayer = DesktopEnvironment.layer({
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "darwin",
  processArch: "arm64",
  appVersion: "1.2.3",
  appPath: "/Applications/T3 Code.app/Contents/Resources/app.asar",
  isPackaged: true,
  resourcesPath: "/Applications/T3 Code.app/Contents/Resources",
  runningUnderArm64Translation: false,
}).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({}))));

describe("DesktopAssets", () => {
  it.effect("uses canonical source-tree icons for unpackaged development", () =>
    Effect.gen(function* () {
      const developmentEnvironmentLayer = DesktopEnvironment.layer({
        dirname: "/repo/apps/desktop/dist-electron",
        homeDirectory: "/Users/alice",
        platform: "linux",
        processArch: "x64",
        appVersion: "1.2.3",
        appPath: "/repo",
        isPackaged: false,
        resourcesPath: "/repo/apps/desktop/resources",
        runningUnderArm64Translation: false,
      }).pipe(
        Layer.provide(
          Layer.mergeAll(
            NodeServices.layer,
            DesktopConfig.layerTest({ VITE_DEV_SERVER_URL: "http://localhost:5733" }),
          ),
        ),
      );
      const fileSystemLayer = FileSystem.layerNoop({
        exists: (path) => Effect.succeed(String(path).includes("/assets/dev/")),
      });
      const assets = yield* DesktopAssets.DesktopAssets.pipe(
        Effect.provide(
          DesktopAssets.layer.pipe(
            Layer.provide(Layer.merge(fileSystemLayer, developmentEnvironmentLayer)),
          ),
        ),
      );

      const icons = yield* assets.iconPaths;

      assert.match(Option.getOrThrow(icons.ico), /assets\/dev\/blueprint-windows\.ico$/);
      assert.match(Option.getOrThrow(icons.png), /assets\/dev\/blueprint-universal-1024\.png$/);
      assert.isTrue(Option.isNone(icons.icns));
    }),
  );

  it.effect("prefers the distribution's icon override for the unpackaged png", () =>
    Effect.gen(function* () {
      const distributionIcon = "/distro/packs/assets/nexplore-mark-1024.png";
      const developmentEnvironmentLayer = DesktopEnvironment.layer({
        dirname: "/repo/apps/desktop/dist-electron",
        homeDirectory: "/Users/alice",
        platform: "darwin",
        processArch: "arm64",
        appVersion: "1.2.3",
        appPath: "/repo",
        isPackaged: false,
        resourcesPath: "/repo/apps/desktop/resources",
        runningUnderArm64Translation: false,
      }).pipe(
        Layer.provide(
          Layer.mergeAll(
            NodeServices.layer,
            DesktopConfig.layerTest({
              VITE_DEV_SERVER_URL: "http://localhost:5733",
              T3CODE_DESKTOP_ICON_PNG: distributionIcon,
            }),
          ),
        ),
      );
      const fileSystemLayer = FileSystem.layerNoop({
        exists: (path) =>
          Effect.succeed(
            String(path) === distributionIcon || String(path).includes("/assets/dev/"),
          ),
      });
      const assets = yield* DesktopAssets.DesktopAssets.pipe(
        Effect.provide(
          DesktopAssets.layer.pipe(
            Layer.provide(Layer.merge(fileSystemLayer, developmentEnvironmentLayer)),
          ),
        ),
      );

      const icons = yield* assets.iconPaths;

      assert.equal(Option.getOrThrow(icons.png), distributionIcon);
      // The ico keeps the source-tree brand asset; only the png is overridden.
      assert.match(Option.getOrThrow(icons.ico), /assets\/dev\/blueprint-windows\.ico$/);
      assert.isTrue(Option.isNone(icons.icns));
    }),
  );

  it.effect("falls back when the distribution's icon override is missing on disk", () =>
    Effect.gen(function* () {
      const distributionIcon = "/distro/packs/assets/missing.png";
      const developmentEnvironmentLayer = DesktopEnvironment.layer({
        dirname: "/repo/apps/desktop/dist-electron",
        homeDirectory: "/Users/alice",
        platform: "darwin",
        processArch: "arm64",
        appVersion: "1.2.3",
        appPath: "/repo",
        isPackaged: false,
        resourcesPath: "/repo/apps/desktop/resources",
        runningUnderArm64Translation: false,
      }).pipe(
        Layer.provide(
          Layer.mergeAll(
            NodeServices.layer,
            DesktopConfig.layerTest({
              VITE_DEV_SERVER_URL: "http://localhost:5733",
              T3CODE_DESKTOP_ICON_PNG: distributionIcon,
            }),
          ),
        ),
      );
      const fileSystemLayer = FileSystem.layerNoop({
        exists: (path) => Effect.succeed(String(path).includes("/assets/dev/")),
      });
      const assets = yield* DesktopAssets.DesktopAssets.pipe(
        Effect.provide(
          DesktopAssets.layer.pipe(
            Layer.provide(Layer.merge(fileSystemLayer, developmentEnvironmentLayer)),
          ),
        ),
      );

      const icons = yield* assets.iconPaths;

      assert.match(Option.getOrThrow(icons.png), /assets\/dev\/blueprint-macos-1024\.png$/);
    }),
  );

  it.effect("preserves the failed asset candidate and filesystem cause", () =>
    Effect.gen(function* () {
      const fileName = "custom.bin";
      const candidatePath = "/repo/apps/desktop/resources/custom.bin";
      const cause = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "exists",
        pathOrDescriptor: candidatePath,
        description: "private filesystem diagnostic",
      });
      const fileSystemLayer = FileSystem.layerNoop({
        exists: (path) => (path === candidatePath ? Effect.fail(cause) : Effect.succeed(false)),
      });
      const assetsLayer = DesktopAssets.layer.pipe(
        Layer.provide(Layer.merge(fileSystemLayer, environmentLayer)),
      );
      const assets = yield* DesktopAssets.DesktopAssets.pipe(Effect.provide(assetsLayer));

      const error = yield* assets.resolveResourcePath(fileName).pipe(Effect.flip);

      assert.instanceOf(error, DesktopAssets.DesktopAssetProbeError);
      assert.equal(error.fileName, fileName);
      assert.equal(error.candidatePath, candidatePath);
      assert.strictEqual(error.cause, cause);
      assert.equal(
        error.message,
        `Failed to probe desktop asset "${fileName}" at ${candidatePath}.`,
      );
      assert.notInclude(error.message, "private filesystem diagnostic");
    }),
  );
});
