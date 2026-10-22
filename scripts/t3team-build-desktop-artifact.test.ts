// @effect-diagnostics nodeBuiltinImport:off - builds fake distro/vendor layouts and git repos on disk for the distribution tests.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";

import {
  createBuildConfig,
  createStageWorkspaceConfig,
  DESKTOP_FILE_EXCLUSIONS,
  emitDesktopBuildChangelog,
  extractIssueReferences,
  findNearestAncestorWithMarker,
  formatArtifactTimestamp,
  isPnpmNodeWrappedBinShim,
  pickFirstSpawnableEsbuildBinary,
  renderChangelog,
  resolveDesktopBuildIconAssets,
  resolveDistroRoot,
  resolveRepoEsbuildBinary,
  resolveRepoEsbuildPackageBin,
  stageDesktopDmgBackground,
} from "./build-desktop-artifact.ts";
import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";

function mockProcess(exitCode: number) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function iconResizeSpawnerLayer(
  commands: Array<{ readonly command: string; readonly args: ReadonlyArray<string> }>,
  exitCodes: ReadonlyArray<number>,
) {
  let commandIndex = 0;
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const childProcess = command as unknown as {
        readonly command: string;
        readonly args: ReadonlyArray<string>;
      };
      commands.push({
        command: childProcess.command,
        args: childProcess.args,
      });
      return Effect.succeed(mockProcess(exitCodes[commandIndex++] ?? 0));
    }),
  );
}

it.layer(NodeServices.layer)("t3team desktop distribution packaging", (it) => {
  it("lets T3CODE_DESKTOP_ICON_PNG override the mac and linux icon sources", () => {
    const previous = process.env.T3CODE_DESKTOP_ICON_PNG;
    process.env.T3CODE_DESKTOP_ICON_PNG = "/distro/packs/assets/nexplore-mark-1024.png";
    try {
      for (const version of ["0.0.17", "0.0.17-nightly.20260413.42"]) {
        assert.deepStrictEqual(resolveDesktopBuildIconAssets(version), {
          macIconPng: "/distro/packs/assets/nexplore-mark-1024.png",
          linuxIconPng: "/distro/packs/assets/nexplore-mark-1024.png",
          windowsIconIco: BRAND_ASSET_PATHS.productionWindowsIconIco,
        });
      }
    } finally {
      if (previous !== undefined) process.env.T3CODE_DESKTOP_ICON_PNG = previous;
      else delete process.env.T3CODE_DESKTOP_ICON_PNG;
    }
  });

  it("lets T3CODE_DESKTOP_ICON_ICO override the Windows icon source", () => {
    const previousPng = process.env.T3CODE_DESKTOP_ICON_PNG;
    const previousIco = process.env.T3CODE_DESKTOP_ICON_ICO;
    process.env.T3CODE_DESKTOP_ICON_PNG = "/distro/packs/assets/nexplore-mark-1024.png";
    process.env.T3CODE_DESKTOP_ICON_ICO = "/distro/packs/assets/nexplore-mark.ico";
    try {
      assert.deepStrictEqual(resolveDesktopBuildIconAssets("0.0.17"), {
        macIconPng: "/distro/packs/assets/nexplore-mark-1024.png",
        linuxIconPng: "/distro/packs/assets/nexplore-mark-1024.png",
        windowsIconIco: "/distro/packs/assets/nexplore-mark.ico",
      });
    } finally {
      if (previousPng !== undefined) process.env.T3CODE_DESKTOP_ICON_PNG = previousPng;
      else delete process.env.T3CODE_DESKTOP_ICON_PNG;
      if (previousIco !== undefined) process.env.T3CODE_DESKTOP_ICON_ICO = previousIco;
      else delete process.env.T3CODE_DESKTOP_ICON_ICO;
    }
  });

  it("keeps the server sidecar stage hoisted and the workspace packages linkable", () => {
    const packages = ["packages/*"];
    assert.deepStrictEqual(
      createStageWorkspaceConfig({ platform: "win", arch: "x64", linuxServerBackend: true }),
      {
        packages,
        supportedArchitectures: { os: ["win32"], cpu: ["x64"] },
        nodeLinker: "hoisted",
        packageExtensions: createStageWorkspaceConfig({ platform: "win", arch: "x64" })
          .packageExtensions,
      },
    );
    const mac = createStageWorkspaceConfig({ platform: "mac", arch: "x64" });
    assert.strictEqual(mac.nodeLinker, undefined);
    assert.deepStrictEqual(mac.packages, packages);
  });

  it("keeps the staged after-pack hook out of the packaged app files", () => {
    for (const hookFile of [
      "!desktop-asar-dts-afterpack.cjs",
      "!desktop-asar-dts-afterpack-utils.cjs",
      "!desktop-asar-dts-afterpack.json",
    ]) {
      assert.include(DESKTOP_FILE_EXCLUSIONS, hookFile);
    }
  });

  it.effect("leaves afterPack unset because electron-builder resolves it against the CWD", () =>
    Effect.gen(function* () {
      // buildDesktopArtifact pins the absolute staged hook path after calling createBuildConfig.
      for (const [platform, target] of [
        ["mac", "dmg"],
        ["linux", "AppImage"],
        ["win", "nsis"],
      ] as const) {
        const config = yield* createBuildConfig({
          platform,
          target,
          version: "1.2.3",
          signed: false,
          mockUpdates: false,
        });
        assert.notProperty(config, "afterPack");
      }
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })))),
  );

  it.effect("packages distribution env files consistently on every desktop platform", () =>
    Effect.gen(function* () {
      for (const [platform, target] of [
        ["mac", "dmg"],
        ["linux", "AppImage"],
        ["win", "nsis"],
      ] as const) {
        const config = yield* createBuildConfig({
          platform,
          target,
          version: "1.2.3",
          signed: false,
          mockUpdates: false,
          includePackagedEnvFiles: true,
        });
        const envResources = (
          config.extraResources as ReadonlyArray<{ readonly from?: unknown; readonly to?: unknown }>
        ).filter(
          (resource) =>
            typeof resource === "object" &&
            resource !== null &&
            (resource.to === ".env" || resource.to === ".env.local"),
        );

        assert.deepStrictEqual(envResources, [
          { from: "apps/desktop/prod-resources/.env", to: ".env" },
          { from: "apps/desktop/prod-resources/.env.local", to: ".env.local" },
        ]);
      }
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })))),
  );

  it.effect("stamps one per-build timestamp into every artifact name of a build", () =>
    Effect.gen(function* () {
      const config = yield* createBuildConfig({
        platform: "mac",
        target: "dmg",
        version: "1.2.3",
        signed: false,
        mockUpdates: false,
        includePackagedIconPng: false,
        artifactTimestamp: "20260823-1645",
      });
      // The stamp lands in the artifact file names (dmg + zip + blockmaps all
      // derive from artifactName) and in the DMG volume title, so each build
      // of the same version is self-identifying on disk and in Finder.
      assert.equal(config.artifactName, "T3-Code-${version}-${arch}-20260823-1645.${ext}");
      assert.equal(
        (config.dmg as { title: string }).title,
        "T3 Code (Beta) 1.2.3 20260823-1645 Installer",
      );
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })))),
  );

  it.effect("derives the artifact base name from the resolved product name", () =>
    Effect.gen(function* () {
      // No override: the default product name is upstream's, and a parenthetical channel
      // suffix is display-only and never lands in file names.
      for (const version of ["1.2.3", "1.2.3-nightly.20260912.7"]) {
        const config = yield* createBuildConfig({
          platform: "mac",
          target: "dmg",
          version,
          signed: false,
          mockUpdates: false,
        });
        assert.match(
          config.artifactName as string,
          /^T3-Code(-[A-Za-z]+)?-\$\{version\}-\$\{arch\}\.\$\{ext\}$/,
        );
      }

      // Branded build: the artifact takes the resolved product name with its
      // casing (what install-desktop.mjs passes from distribution.json).
      const branded = yield* createBuildConfig({
        platform: "mac",
        target: "dmg",
        version: "1.2.3",
        signed: false,
        mockUpdates: false,
        productNameOverride: "Nexi Work",
      });
      assert.equal(branded.productName, "Nexi Work");
      assert.equal(branded.artifactName, "Nexi-Work-${version}-${arch}.${ext}");

      // Same via the environment variable the desktop build script reads when
      // no explicit override is passed.
      const previous = process.env.T3CODE_DESKTOP_PRODUCT_NAME;
      process.env.T3CODE_DESKTOP_PRODUCT_NAME = "Nexi Work";
      try {
        const envBranded = yield* createBuildConfig({
          platform: "mac",
          target: "dmg",
          version: "1.2.3",
          signed: false,
          mockUpdates: false,
        });
        assert.equal(envBranded.artifactName, "Nexi-Work-${version}-${arch}.${ext}");
      } finally {
        if (previous !== undefined) process.env.T3CODE_DESKTOP_PRODUCT_NAME = previous;
        else delete process.env.T3CODE_DESKTOP_PRODUCT_NAME;
      }
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })))),
  );

  it("formats the per-build artifact timestamp as local yyyyMMdd-HHmm", () => {
    // A fixed instant (09:05 UTC); the expected value is derived from ICU's
    // local rendering of that instant, so the assertion holds in any timezone
    // without constructing a Date (the repo lints against `new Date`).
    const date = DateTime.toDate(DateTime.makeUnsafe("2026-08-23T09:05:00Z"));
    const parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((entry) => entry.type === type)?.value ?? "";
    const expected = `${part("year")}${part("month")}${part("day")}-${part("hour")}${part("minute")}`;
    const formatted = formatArtifactTimestamp(date);
    assert.equal(formatted, expected);
    assert.match(formatted, /^\d{8}-\d{4}$/u);
  });

  it("renders the per-build changelog from git log lines and dedupes issue refs", () => {
    const changelog = renderChangelog({
      productName: "Nexi Work",
      version: "0.0.33",
      distroSha: "d0ac74163abc",
      vendorSha: "194a33db1abc",
      vendorLogLines: ["6c26037f1 feat(release): stamp desktop artifact names (#58)"],
      distroLogLines: ["d0ac74163 chore(vendor): pin t3code 194a33db1 (#57, #58)"],
      timestamp: "20260823-1645",
    });
    assert.match(changelog, /^# Nexi Work 0\.0\.33 — build 20260823-1645\n/u);
    assert.include(changelog, "- Distro: d0ac74163abc");
    assert.include(changelog, "- Vendor (t3code): 194a33db1abc");
    assert.include(changelog, "## Vendor changes since previous build\n\n6c26037f1");
    // #58 appears in both logs but is listed once, in first-seen order.
    assert.include(changelog, "## Issue references\n\n- #58\n- #57\n");
    assert.isTrue(changelog.split("\n").length < 60);
  });

  it("marks empty changelog sections and extracts unique issue references", () => {
    const empty = renderChangelog({
      productName: "T3 Code",
      version: "0.0.1",
      distroSha: "unknown",
      vendorSha: "unknown",
      vendorLogLines: [],
      distroLogLines: [],
      timestamp: "20260823-1645",
    });
    assert.include(empty, "## Vendor changes since previous build\n\n(none)");
    assert.include(empty, "## Issue references\n\n(none)");
    assert.deepEqual(
      extractIssueReferences(["abc feat: fix #58 and #57", "def fix: again (#58)"]),
      ["#58", "#57"],
    );
  });

  it("walks up to the nearest ancestor carrying the distribution marker", () => {
    const distro = NodePath.resolve("/fake/distro");
    assert.equal(
      findNearestAncestorWithMarker("/fake/distro/vendor/t3code/scripts", (dir) => dir === distro),
      distro,
    );
  });

  it("stops at the start dir itself when it carries the marker", () => {
    const repo = NodePath.resolve("/fake/repo");
    assert.equal(
      findNearestAncestorWithMarker("/fake/repo/scripts", (dir) => dir === repo),
      repo,
    );
  });

  it("returns undefined when no ancestor carries the marker", () => {
    assert.isUndefined(
      findNearestAncestorWithMarker("/fake/distro/vendor/t3code/scripts", () => false),
    );
  });

  it.effect("resolves the distribution root from a nested distro/vendor/t3code layout", () =>
    Effect.gen(function* () {
      const distro = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "distro-root-"));
      const bare = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "distro-root-bare-"));
      const stateDistro = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "distro-root-state-"));
      const shadowed = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "distro-root-shadow-"));
      try {
        // distro/packs/nexplore-global + distro/vendor/t3code/scripts
        NodeFS.mkdirSync(NodePath.join(distro, "vendor", "t3code", "scripts"), {
          recursive: true,
        });
        NodeFS.mkdirSync(NodePath.join(distro, "packs", "nexplore-global"), {
          recursive: true,
        });
        const found = yield* resolveDistroRoot(NodePath.join(distro, "vendor", "t3code"));
        assert.equal(found, NodePath.resolve(distro));

        // The .nexi-dev/desktop-installer state dir is a marker on its own.
        NodeFS.mkdirSync(NodePath.join(stateDistro, "vendor", "t3code"), {
          recursive: true,
        });
        NodeFS.mkdirSync(NodePath.join(stateDistro, ".nexi-dev", "desktop-installer"), {
          recursive: true,
        });
        const foundByState = yield* resolveDistroRoot(
          NodePath.join(stateDistro, "vendor", "t3code"),
        );
        assert.equal(foundByState, NodePath.resolve(stateDistro));

        // No marker anywhere above a bare vendor checkout → undefined, so the
        // caller falls back to the vendor root with a warning.
        NodeFS.mkdirSync(NodePath.join(bare, "vendor", "t3code"), { recursive: true });
        assert.isUndefined(yield* resolveDistroRoot(NodePath.join(bare, "vendor", "t3code")));

        // A stale .nexi-dev/desktop-installer left inside the vendor checkout
        // by a previous buggy build must not shadow the real distribution root.
        NodeFS.mkdirSync(
          NodePath.join(shadowed, "vendor", "t3code", ".nexi-dev", "desktop-installer"),
          { recursive: true },
        );
        NodeFS.mkdirSync(NodePath.join(shadowed, "packs", "nexplore-global"), {
          recursive: true,
        });
        const foundShadowed = yield* resolveDistroRoot(NodePath.join(shadowed, "vendor", "t3code"));
        assert.equal(foundShadowed, NodePath.resolve(shadowed));
      } finally {
        NodeFS.rmSync(distro, { recursive: true, force: true });
        NodeFS.rmSync(bare, { recursive: true, force: true });
        NodeFS.rmSync(stateDistro, { recursive: true, force: true });
        NodeFS.rmSync(shadowed, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "writes the changelog and last-build.json under the distro root with distinct SHAs",
    () =>
      Effect.gen(function* () {
        const git = (args: readonly string[], cwd: string): string =>
          NodeChildProcess.execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
        const makeRepo = (dir: string, message: string): string => {
          NodeFS.mkdirSync(dir, { recursive: true });
          git(["init", "-q"], dir);
          git(
            [
              "-c",
              "user.email=build@local",
              "-c",
              "user.name=build",
              "commit",
              "-q",
              "--allow-empty",
              "-m",
              message,
            ],
            dir,
          );
          return git(["rev-parse", "--short=12", "HEAD"], dir);
        };
        const base = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "distro-root-e2e-"));
        try {
          // distro/packs + distro/vendor/t3code, each its own git repo.
          const distroRoot = NodePath.join(base, "distro");
          const vendorRoot = NodePath.join(distroRoot, "vendor", "t3code");
          NodeFS.mkdirSync(NodePath.join(distroRoot, "packs", "nexplore-global"), {
            recursive: true,
          });
          NodeFS.mkdirSync(vendorRoot, { recursive: true });
          const distroSha = makeRepo(distroRoot, "distro: add the nexplore-global pack");
          const vendorSha = makeRepo(vendorRoot, "vendor: ship the desktop build script");
          assert.notEqual(distroSha, vendorSha);

          yield* emitDesktopBuildChangelog({
            distroRoot: NodePath.resolve(distroRoot),
            vendorRoot: NodePath.resolve(vendorRoot),
            productName: "Nexi Work",
            version: "0.0.33",
            distroSha,
            vendorSha,
            timestamp: "20260823-2251",
          });

          // State lands under the DISTRO root, not the vendor checkout.
          const stateDir = NodePath.join(distroRoot, ".nexi-dev", "desktop-installer");
          const state = NodeFS.readFileSync(NodePath.join(stateDir, "last-build.json"), "utf8");
          assert.include(state, `"distroSha":"${distroSha}"`);
          assert.include(state, `"vendorSha":"${vendorSha}"`);
          assert.isFalse(
            NodeFS.existsSync(NodePath.join(vendorRoot, ".nexi-dev", "desktop-installer")),
          );

          // The changelog shows the distinct SHAs and each repo's own history.
          const changelog = NodeFS.readFileSync(
            NodePath.join(stateDir, "CHANGELOG-20260823-2251.md"),
            "utf8",
          );
          assert.include(changelog, `- Distro: ${distroSha}`);
          assert.include(changelog, `- Vendor (t3code): ${vendorSha}`);
          assert.include(changelog, "distro: add the nexplore-global pack");
          assert.include(changelog, "vendor: ship the desktop build script");
        } finally {
          NodeFS.rmSync(base, { recursive: true, force: true });
        }
      }),
  );

  it.effect("rasterizes a distribution DMG background instead of the vendor SVG", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const stageResourcesDir = yield* fs.makeTempDirectoryScoped({
          prefix: "t3code-dmg-background-override-",
        });
        const overridePath = path.join(stageResourcesDir, "distro-background.svg");
        yield* fs.writeFileString(overridePath, '<svg xmlns="http://www.w3.org/2000/svg"/>');
        const dmgDir = path.join(stageResourcesDir, "dmg");
        yield* fs.makeDirectory(dmgDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(dmgDir, "dmg-background-latest.svg"),
          '<svg xmlns="http://www.w3.org/2000/svg"/>',
        );
        const previous = process.env.T3CODE_DESKTOP_DMG_BACKGROUND;
        process.env.T3CODE_DESKTOP_DMG_BACKGROUND = overridePath;
        const commands: Array<{ readonly command: string; readonly args: ReadonlyArray<string> }> =
          [];
        yield* stageDesktopDmgBackground(stageResourcesDir, "latest", false).pipe(
          Effect.provide(iconResizeSpawnerLayer(commands, [0, 0])),
          Effect.ensuring(
            Effect.sync(() => {
              if (previous !== undefined) process.env.T3CODE_DESKTOP_DMG_BACKGROUND = previous;
              else delete process.env.T3CODE_DESKTOP_DMG_BACKGROUND;
            }),
          ),
        );
        assert.equal(commands[0]?.args.at(-3), overridePath);
        assert.notEqual(commands[0]?.args.at(-3), path.join(dmgDir, "dmg-background-latest.svg"));
      }),
    ),
  );
});

const BROKEN_PNPM_ESBUILD_SHIM = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
if [ -z "$NODE_PATH" ]; then
  export NODE_PATH="/tmp/fake"
fi
if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/../esbuild/bin/esbuild" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node  "$basedir/../esbuild/bin/esbuild" "$@"
else
  exec node  "$basedir/../esbuild/bin/esbuild" "$@"
fi
# cmd-shim-target=/tmp/fake/esbuild/bin/esbuild
`;

const GOOD_PNPM_ESBUILD_SHIM = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec "$basedir/../esbuild/bin/esbuild"   "$@"
exit $?
# cmd-shim-target=/tmp/fake/esbuild/bin/esbuild
`;

it("detects pnpm cmd-shims that wrap esbuild with node", async () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-esbuild-shim-"));
  try {
    const broken = NodePath.join(root, "broken-esbuild");
    const good = NodePath.join(root, "good-esbuild");
    const nativeLike = NodePath.join(root, "native-esbuild");
    NodeFS.writeFileSync(broken, BROKEN_PNPM_ESBUILD_SHIM, { mode: 0o755 });
    NodeFS.writeFileSync(good, GOOD_PNPM_ESBUILD_SHIM, { mode: 0o755 });
    // Mach-O/ELF magic — not a shebang, so not a node-wrapped shim.
    NodeFS.writeFileSync(nativeLike, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00]));
    assert.isTrue(await isPnpmNodeWrappedBinShim(broken));
    assert.isFalse(await isPnpmNodeWrappedBinShim(good));
    assert.isFalse(await isPnpmNodeWrappedBinShim(nativeLike));
  } finally {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

it("resolves esbuild via the package bin, skipping a node-wrapped .bin shim", async () => {
  // Resolution returns real paths; macOS's tmpdir is a /var -> /private/var symlink.
  const root = NodeFS.realpathSync(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-esbuild-resolve-")),
  );
  try {
    const webPkg = NodePath.join(root, "apps", "web");
    const esbuildPkg = NodePath.join(root, "node_modules", "esbuild");
    const brokenShimDir = NodePath.join(root, "node_modules", ".pnpm", "node_modules", ".bin");
    NodeFS.mkdirSync(webPkg, { recursive: true });
    NodeFS.mkdirSync(NodePath.join(esbuildPkg, "bin"), { recursive: true });
    NodeFS.mkdirSync(brokenShimDir, { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(webPkg, "package.json"),
      JSON.stringify({ name: "web", dependencies: { esbuild: "0.0.0" } }),
    );
    NodeFS.writeFileSync(
      NodePath.join(root, "package.json"),
      JSON.stringify({ name: "root", private: true }),
    );
    NodeFS.writeFileSync(
      NodePath.join(esbuildPkg, "package.json"),
      JSON.stringify({ name: "esbuild", bin: { esbuild: "bin/esbuild" } }),
    );
    const packageBin = NodePath.join(esbuildPkg, "bin", "esbuild");
    // Simulate postinstall native binary (not valid JS).
    NodeFS.writeFileSync(packageBin, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x01, 0x02]), {
      mode: 0o755,
    });
    NodeFS.writeFileSync(NodePath.join(brokenShimDir, "esbuild"), BROKEN_PNPM_ESBUILD_SHIM, {
      mode: 0o755,
    });
    // Also plant a broken root .bin shim — must still prefer the package bin.
    NodeFS.mkdirSync(NodePath.join(root, "node_modules", ".bin"), { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(root, "node_modules", ".bin", "esbuild"),
      BROKEN_PNPM_ESBUILD_SHIM,
      { mode: 0o755 },
    );

    assert.equal(resolveRepoEsbuildPackageBin(root), packageBin);
    assert.equal(await resolveRepoEsbuildBinary(root), packageBin);
  } finally {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

it("skips a leading node-wrapped shim and picks the next spawnable esbuild", async () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-esbuild-fallback-"));
  try {
    const brokenShim = NodePath.join(root, "broken-esbuild");
    const goodShim = NodePath.join(root, "good-esbuild");
    NodeFS.writeFileSync(brokenShim, BROKEN_PNPM_ESBUILD_SHIM, { mode: 0o755 });
    NodeFS.writeFileSync(goodShim, GOOD_PNPM_ESBUILD_SHIM, { mode: 0o755 });
    assert.equal(await pickFirstSpawnableEsbuildBinary([brokenShim, goodShim]), goodShim);
    assert.isUndefined(await pickFirstSpawnableEsbuildBinary([brokenShim]));
  } finally {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});
