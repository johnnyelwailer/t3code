import "vite-plus/test/config";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- tsdown needs the asset path when it reads this config.
import * as NodePath from "node:path";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";
import { loadRepoEnv } from "../../scripts/lib/public-config.ts";
import rootPackageJson from "../../package.json" with { type: "json" };
import packageJson from "./package.json" with { type: "json" };
import { t3teamRawTextPackPlugin } from "./scripts/t3team-rawTextPackPlugin.ts";
import { t3teamDistributionPackPlugin } from "./scripts/t3team-distributionPackPlugin.ts";
import { t3teamTypescriptLibPackPlugin } from "./scripts/t3team-typescriptLibPackPlugin.ts";
import { WeightedShardSequencer } from "./src/testUtils/weightedShardSequencer.ts";

// NSIS install time tracks file count, not bytes.
import {
  isExternalCliDependency,
  shouldBundleCliDependency,
} from "../../scripts/lib/cli-external-packages.ts";

export { shouldBundleCliDependency };

const repoEnv = loadRepoEnv();
const cliBuildChannel = /^[^-+]+-(?:nightly|preview)\./.test(packageJson.version)
  ? "nightly"
  : "latest";
// Official release workflows set the telemetry channel; local builds and forks use "dev".
const TELEMETRY_CHANNELS = ["stable", "nightly", "preview", "dev"];
const telemetryChannel = process.env.T3CODE_TELEMETRY_CHANNEL?.trim() || "dev";
if (!TELEMETRY_CHANNELS.includes(telemetryChannel)) {
  throw new Error(
    `T3CODE_TELEMETRY_CHANNEL must be one of ${TELEMETRY_CHANNELS.join(", ")}, got "${telemetryChannel}".`,
  );
}

// tsdown SEA needs one chunk (sourcemaps count) and Node >=25.7, so package separately.
// "bundle" emits the embedded CLI. "1" builds dist-exe/t3 from the bootstrap.
// TEMPORARY one-time Node fix. Remove when fixed: https://github.com/nodejs/node/issues/67048
// "bootstrap" stops at bin.mjs for scripts/cli.ts to inject (linux-arm64).
const packMode = process.env.T3CODE_PACK_EXE;
const packBootstrap = packMode === "1" || packMode === "bootstrap";
const packExecutable = packBootstrap || packMode === "bundle";
const cliAssetDir = process.env.T3CODE_CLI_ASSET_DIR ?? "";
if (packExecutable && !cliAssetDir) throw new Error("Build the executable with build:exe.");
// TEMPORARY one-time Node fix. Remove when fixed: https://github.com/nodejs/node/issues/67048
// No linux-arm64: --build-sea output cannot load on 16/64 KiB page kernels, so it builds natively.
const SEA_TARGETS = {
  "darwin-arm64": { platform: "darwin", arch: "arm64" },
  "darwin-x64": { platform: "darwin", arch: "x64" },
  "linux-x64": { platform: "linux", arch: "x64" },
  "win-arm64": { platform: "win", arch: "arm64" },
  "win-x64": { platform: "win", arch: "x64" },
} as const;
const packExecutableTarget = process.env.T3CODE_PACK_EXE_TARGET?.trim();
const cliNodeVersion = rootPackageJson.engines.node;
if (packExecutable && !packExecutableTarget && process.versions.node !== cliNodeVersion) {
  throw new Error(
    `Native CLI executables must be built with Node ${cliNodeVersion}; running ${process.versions.node}.`,
  );
}
if (packExecutableTarget && !Object.hasOwn(SEA_TARGETS, packExecutableTarget)) {
  throw new Error(
    `T3CODE_PACK_EXE_TARGET must be one of ${Object.keys(SEA_TARGETS).join(", ")}, got "${packExecutableTarget}".`,
  );
}
const packExecutableTargets = packExecutableTarget
  ? [
      {
        ...SEA_TARGETS[packExecutableTarget as keyof typeof SEA_TARGETS],
        nodeVersion: cliNodeVersion,
      },
    ]
  : undefined;

// The root config's `projects` route repo-root runs to package configs,
// including this one. Inheriting them would make this config a container.
const { projects: _rootTestProjects, ...baseTestConfig } = baseConfig.test ?? {};
// Workspace cache configuration is invalid on a package config.
const { run: _rootRunConfig, ...basePackageConfig } = baseConfig;

export default mergeConfig(
  { ...basePackageConfig, test: baseTestConfig },
  defineConfig({
    run: {
      tasks: {
        build: {
          command: "node scripts/cli.ts build",
          dependsOn: ["@t3tools/web#build"],
          cache: false,
        },
      },
    },
    pack: {
      // SEA embeds one entry; expose the history worker as a hidden subcommand.
      // The two host-module entries are what the recipe-module resolver falls back to when
      // `effect` and `@t3team/sdk` are inlined and not installed (a published bundle in a session).
      entry: packBootstrap
        ? ["src/bin.ts"]
        : packExecutable
          ? ["src/binMain.ts"]
          : [
              "src/bin.ts",
              "src/t3team-bin.ts",
              "src/claude-history-worker.ts",
              "src/t3team-hostEffect.ts",
              "src/t3team-hostSdk.ts",
            ],
      // `?raw` is a vite feature; pack is tsdown/rolldown and has no asset pipeline of its own.
      // Without this, source that ships as TEXT could not be authored as a typechecked module.
      // The distribution plugin inlines the compiled-in distribution (see
      // scripts/t3team-distributionPackPlugin.ts) when T3CODE_DISTRIBUTION names one.
      plugins: [
        t3teamRawTextPackPlugin(),
        t3teamDistributionPackPlugin(),
        t3teamTypescriptLibPackPlugin(),
      ],
      outDir: packBootstrap ? "dist-exe" : packExecutable ? cliAssetDir : "dist",
      sourcemap: !packExecutable,
      clean: true,
      // The inlined TypeScript compiler (packages/runbook-ts/src/typescript.ts
      // statically imports it) is CJS and reads `__filename` at module init.
      // Without the CJS shims the emitted chunk crashes before any orchestration
      // code runs — which is exactly the packaged-app failure this inlining fixes.
      shims: true,
      // SEA can only resolve built-ins; keep dynamic imports inside each emitted module.
      ...(packExecutable ? { outputOptions: { codeSplitting: false } } : {}),
      ...(packMode === "1"
        ? {
            exe: {
              fileName: "t3",
              outDir: "dist-exe",
              ...(packExecutableTargets ? { targets: packExecutableTargets } : {}),
              // Node SEA useCodeCache breaks import(), which the server needs.
              seaConfig: {
                useCodeCache: false,
                // The bootstrap loads the embedded CLI with require(esm).
                execArgv: ["--require-module"],
                assets: { "binMain.mjs": NodePath.join(cliAssetDir, "binMain.mjs") },
              },
            },
          }
        : {}),
      deps: {
        // alwaysBundle=false has no opinion; neverBundle must retain transitive native acceleration.
        alwaysBundle: shouldBundleCliDependency,
        neverBundle: (id: string) =>
          (packBootstrap && id === "./binMain.ts") || isExternalCliDependency(id),
        onlyBundle: false,
      },
      banner: {
        js: "#!/usr/bin/env node\n",
      },
      define: {
        __T3CODE_BUILD_CHANNEL__: JSON.stringify(cliBuildChannel),
        __T3CODE_TELEMETRY_CHANNEL__: JSON.stringify(telemetryChannel),
        __T3CODE_BUILD_RELAY_URL__: JSON.stringify(repoEnv.T3CODE_RELAY_URL?.trim() ?? ""),
        __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__: JSON.stringify(
          repoEnv.T3CODE_CLERK_PUBLISHABLE_KEY?.trim() ?? "",
        ),
        __T3CODE_BUILD_CLERK_CLI_OAUTH_CLIENT_ID__: JSON.stringify(
          repoEnv.T3CODE_CLERK_CLI_OAUTH_CLIENT_ID?.trim() ?? "",
        ),
        __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_URL__: JSON.stringify(
          repoEnv.T3CODE_RELAY_CLIENT_OTLP_TRACES_URL?.trim() ?? "",
        ),
        __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_DATASET__: JSON.stringify(
          repoEnv.T3CODE_RELAY_CLIENT_OTLP_TRACES_DATASET?.trim() ?? "",
        ),
        __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_TOKEN__: JSON.stringify(
          repoEnv.T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN?.trim() ?? "",
        ),
      },
    },
    resolve: {
      // `@t3team/sdk` (and subpaths) resolve via tsconfig `paths`; tests and pack need
      // the same mapping at runtime.
      tsconfigPaths: true,
    },
    test: {
      // Run the server's own suites plus the @t3team/sdk source tests. The SDK is a
      // path-aliased source package (no package.json / `test` script of its own), so
      // package-scoped test runs would otherwise never reach it; folding its tests into
      // the server run is what makes the monorepo test run cover both.
      include: [
        "src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
        "integration/**/*.{test,spec}.?(c|m)[jt]s?(x)",
        "../../packages/t3team-sdk/src/**/*.test.ts",
      ],
      // The server suite exercises sqlite, git, temp worktrees, and orchestration
      // runtimes heavily. Running files in parallel introduces load-sensitive flakes.
      fileParallelism: false,
      sequence: { sequencer: WeightedShardSequencer },
      setupFiles: [
        "./src/testUtils/gitConfig.setup.ts",
        "./src/testUtils/managedServiceEnv.setup.ts",
      ],
      hookTimeout: 120_000,
      testTimeout: 120_000,
    },
  }),
);
