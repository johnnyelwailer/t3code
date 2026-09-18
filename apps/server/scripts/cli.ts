#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { DEVELOPMENT_ICON_OVERRIDES } from "../../../scripts/lib/brand-assets.ts";
import { findEsmImportsOfExternalPackages } from "../../../scripts/lib/cli-external-packages.ts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import {
  ServerCliBuildAssetMissingError,
  ServerCliCommandExitError,
  ServerCliDevelopmentIconSourceMissingError,
  ServerCliDevelopmentIconTargetMissingError,
  ServerCliDistributionNotInlinedError,
  ServerCliExecutableImportError,
  ServerCliPublishIconSourceMissingError,
  ServerCliPublishIconTargetMissingError,
  ServerCliWebClientMissingError,
} from "./cliErrors.ts";

const RepoRoot = Effect.service(Path.Path).pipe(
  Effect.flatMap((path) => path.fromFileUrl(new URL("../../..", import.meta.url))),
);

const runCommand = Effect.fn("runCommand")(function* (command: ChildProcess.StandardCommand) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(command);
  const exitCode = yield* child.exitCode;

  if (exitCode !== 0) {
    return yield* new ServerCliCommandExitError({
      command: command.command,
      args: command.args,
      cwd: command.options.cwd,
      exitCode,
    });
  }
});

const applyDevelopmentIconOverrides = Effect.fn("applyDevelopmentIconOverrides")(function* (
  repoRoot: string,
  serverDir: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  for (const override of DEVELOPMENT_ICON_OVERRIDES) {
    const sourcePath = path.join(repoRoot, override.sourceRelativePath);
    const targetPath = path.join(serverDir, override.targetRelativePath);

    if (!(yield* fs.exists(sourcePath))) {
      return yield* new ServerCliDevelopmentIconSourceMissingError({ sourcePath });
    }
    if (!(yield* fs.exists(targetPath))) {
      return yield* new ServerCliDevelopmentIconTargetMissingError({ targetPath });
    }

    yield* fs.copyFile(sourcePath, targetPath);
  }

  yield* Effect.log("[cli] Applied development icon overrides to dist/client");
});

// ---------------------------------------------------------------------------
// build subcommand
// ---------------------------------------------------------------------------

/**
 * A build invoked with T3CODE_DISTRIBUTION must ship that distribution compiled in, not the
 * empty distribution stub. String literals survive minification and stripping unchanged, so the
 * manifest's own strings — branding values and the asset entries under `assetsDir` (pack-root-
 * relative) that the inlined asset map carries — are markers only the inlined module can emit.
 * (The theme's `name` is deliberately NOT a marker: a distribution's theme name can collide with
 * strings in the fork's own source — the nexplore theme is called "Nexplore", which the server
 * source carries on its own.) The pack lands in a shared chunk (not necessarily the entry file),
 * so every emitted `*.mjs` under dist is scanned. Before this check a silent no-op shipped a
 * server that boots with no provider and no branding.
 */
const DistributionManifestJson = Schema.Struct({
  branding: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  assetsDir: Schema.optional(Schema.String),
});
const decodeEffectDistributionManifest = Schema.decodeEffect(
  Schema.fromJsonString(DistributionManifestJson),
);

const verifyCompiledInDistribution = Effect.fn("verifyCompiledInDistribution")(function* (
  distDir: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const distributionDir = process.env.T3CODE_DISTRIBUTION?.trim();
  if (distributionDir === undefined || distributionDir === "") return;

  const markers: string[] = [];
  const manifestPath = path.join(distributionDir, "distribution.json");
  let manifest:
    | { branding?: Record<string, unknown> | undefined; assetsDir?: string | undefined }
    | undefined;
  if (yield* fs.exists(manifestPath)) {
    const contents = yield* fs.readFileString(manifestPath);
    manifest = Option.getOrUndefined(
      yield* decodeEffectDistributionManifest(contents).pipe(Effect.option),
    );
  }
  for (const value of Object.values(manifest?.branding ?? {})) {
    if (typeof value === "string" && value !== "") markers.push(value);
  }
  const assetsDir = manifest?.assetsDir;
  if (typeof assetsDir === "string" && assetsDir !== "") {
    const assetDirPath = path.join(distributionDir, assetsDir);
    if (yield* fs.exists(assetDirPath)) {
      const assetNames = yield* fs
        .readDirectory(assetDirPath)
        .pipe(Effect.orElseSucceed((): string[] => []));
      for (const name of assetNames) markers.push(`${assetsDir}/${name}`);
    }
  }

  const names = yield* fs.readDirectory(distDir).pipe(Effect.orElseSucceed((): string[] => []));
  let scannedFiles = 0;
  let inlined = false;
  for (const name of names) {
    if (!name.endsWith(".mjs")) continue;
    const contents = yield* fs.readFileString(path.join(distDir, name));
    scannedFiles += 1;
    if (!inlined && markers.some((marker) => contents.includes(marker))) inlined = true;
  }

  if (!inlined) {
    return yield* new ServerCliDistributionNotInlinedError({
      distributionDir,
      expectedMarkers: markers,
      scannedFiles,
    });
  }
  yield* Effect.log(
    `[cli] Compiled-in distribution verified: ${markers.length} marker(s) found across ${scannedFiles} dist file(s)`,
  );
});

const buildCmd = Command.make(
  "build",
  {
    verbose: Flag.boolean("verbose").pipe(Flag.withDefault(false)),
  },
  (config) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const repoRoot = yield* RepoRoot;
      const serverDir = path.join(repoRoot, "apps/server");

      yield* Effect.log("[cli] Running tsdown...");
      yield* runCommand(
        ChildProcess.make(process.execPath, ["--run", "build:bundle"], {
          cwd: serverDir,
          stdout: config.verbose ? "inherit" : "ignore",
          stderr: "inherit",
          shell: false,
        }),
      );

      // A build asked to inline a distribution must be able to prove it did.
      yield* verifyCompiledInDistribution(path.join(serverDir, "dist"));

      const webDist = path.join(repoRoot, "apps/web/dist");
      const clientTarget = path.join(serverDir, "dist/client");

      // The packed server serves the web client from dist/client. If the workspace has no built
      // web client yet (fresh checkout, or a task run that did not reach @t3tools/web#build),
      // build it here: a release artifact must never ship a server whose first boot answers 503
      // on "/" because the client bundle was skipped.
      if (!(yield* fs.exists(webDist))) {
        yield* Effect.log("[cli] Web dist not found — building the web client first...");
        const webSpawn = yield* resolveSpawnCommand("vp", ["build"]);
        yield* runCommand(
          ChildProcess.make(webSpawn.command, webSpawn.args, {
            cwd: path.join(repoRoot, "apps/web"),
            stdout: config.verbose ? "inherit" : "ignore",
            stderr: "inherit",
            shell: webSpawn.shell,
          }),
        );
      }
      if (!(yield* fs.exists(path.join(webDist, "index.html")))) {
        return yield* new ServerCliWebClientMissingError({ webDist });
      }

      yield* fs.copy(webDist, clientTarget);
      yield* applyDevelopmentIconOverrides(repoRoot, serverDir);
      yield* Effect.log("[cli] Bundled web app into dist/client");
    }),
).pipe(Command.withDescription("Build the server package (tsdown + bundle web client)."));

// ---------------------------------------------------------------------------
// build-exe subcommand
// ---------------------------------------------------------------------------

const buildExeCmd = Command.make(
  "build-exe",
  {
    verbose: Flag.boolean("verbose").pipe(Flag.withDefault(false)),
    target: Flag.string("target").pipe(
      Flag.withDescription(
        "Cross-build for <platform>-<arch> in nodejs.org naming (for example darwin-x64); defaults to the host.",
      ),
      Flag.optional,
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const repoRoot = yield* RepoRoot;
      const serverDir = path.join(repoRoot, "apps/server");

      yield* Effect.log("[cli] Building single-executable...");
      const spawnCommand = yield* resolveSpawnCommand("vp", ["pack"]);
      yield* runCommand(
        ChildProcess.make(spawnCommand.command, spawnCommand.args, {
          cwd: serverDir,
          env: {
            ...process.env,
            T3CODE_PACK_EXE: "1",
            ...Option.match(config.target, {
              onNone: () => ({}),
              onSome: (target) => ({ T3CODE_PACK_EXE_TARGET: target }),
            }),
          },
          stdout: config.verbose ? "inherit" : "ignore",
          stderr: "inherit",
          shell: spawnCommand.shell,
        }),
      );

      // The executable can only `import` built-ins. A file-backed import
      // passes the bundler and `node dist/bin.mjs`, then throws inside the
      // binary, so read the emitted module graph rather than trusting config.
      const bundlePath = path.join(serverDir, "dist-exe/bin.mjs");
      const specifiers = findEsmImportsOfExternalPackages(yield* fs.readFileString(bundlePath));
      if (specifiers.length > 0) {
        return yield* new ServerCliExecutableImportError({ bundlePath, specifiers });
      }
      yield* Effect.log(
        "[cli] Built dist-exe/t3 (expects client/, resource-monitor/, and the runtime-external node_modules beside it; scripts/build-cli-archive.ts assembles that tree)",
      );
    }),
).pipe(
  Command.withDescription(
    "Build the server as a Node single-executable (needs a Node 25.7+ host for --build-sea). The binary still resolves native packages from a node_modules tree beside it.",
  ),
);

// ---------------------------------------------------------------------------
// publish subcommand
// ---------------------------------------------------------------------------

/**
 * Publishes the tarballs scripts/build-npm-platform-packages.ts produced:
 * every `@t3code/t3-<platform>.tgz` first, `t3.tgz` (the launcher) last, so
 * the launcher is never installable before the executables it depends on.
 * Tarballs rather than directories because `npm publish <dir>` strips the
 * `node_modules/` the executable loads its native addons from.
 */
const publishCmd = Command.make(
  "publish",
  {
    packagesDir: Flag.string("packages-dir").pipe(
      Flag.withDescription("Output dir of scripts/build-npm-platform-packages.ts."),
    ),
    tag: Flag.string("tag").pipe(Flag.withDefault("latest")),
    access: Flag.string("access").pipe(Flag.withDefault("public")),
    provenance: Flag.boolean("provenance").pipe(Flag.withDefault(false)),
    dryRun: Flag.boolean("dry-run").pipe(Flag.withDefault(false)),
    verbose: Flag.boolean("verbose").pipe(Flag.withDefault(false)),
  },
  (config) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      // npm runs with cwd set to the packages dir below, so tarball paths are
      // resolved once here rather than joined twice.
      const packagesDir = path.resolve(config.packagesDir);
      const scopeDir = path.join(packagesDir, "@t3code");
      const launcherTarball = path.join(packagesDir, "t3.tgz");
      const platformTarballs = (yield* fs
        .readDirectory(scopeDir)
        .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => [])))
        .filter((entry) => entry.startsWith("t3-") && entry.endsWith(".tgz"))
        .sort()
        .map((entry) => path.join(scopeDir, entry));
      if (platformTarballs.length === 0) {
        return yield* new ServerCliBuildAssetMissingError({
          assetPath: path.join(scopeDir, "t3-<platform>.tgz"),
        });
      }
      if (!(yield* fs.exists(launcherTarball))) {
        return yield* new ServerCliBuildAssetMissingError({ assetPath: launcherTarball });
      }

      const args = ["publish", "--access", config.access, "--tag", config.tag];
      if (config.provenance) args.push("--provenance");
      if (config.dryRun) args.push("--dry-run");

      for (const tarball of [...platformTarballs, launcherTarball]) {
        const spawnCommand = yield* resolveSpawnCommand("npm", [...args, tarball]);
        yield* Effect.log(`[cli] npm ${args.join(" ")} ${path.basename(tarball)}`);
        yield* runCommand(
          ChildProcess.make(spawnCommand.command, spawnCommand.args, {
            cwd: packagesDir,
            stdout: config.verbose ? "inherit" : "ignore",
            stderr: "inherit",
            shell: spawnCommand.shell,
          }),
        );
      }
    }),
).pipe(
  Command.withDescription(
    "Publish the @t3code/t3-<platform> tarballs and then the t3 launcher to npm.",
  ),
);

// ---------------------------------------------------------------------------
// root command
// ---------------------------------------------------------------------------

const cli = Command.make("cli").pipe(
  Command.withDescription("T3 server build & publish CLI."),
  Command.withSubcommands([buildCmd, buildExeCmd, publishCmd]),
);

Command.run(cli, { version: "0.0.0" }).pipe(
  Effect.scoped,
  Effect.provide([Logger.layer([Logger.consolePretty()]), NodeServices.layer]),
  NodeRuntime.runMain,
);
