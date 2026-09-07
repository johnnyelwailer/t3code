/**
 * The checkOrchestrationBundle effect (split out of
 * scripts/t3team-check-orchestration-bundle.ts for the additive guard's LOC
 * ceiling).
 */
// @effect-diagnostics nodeBuiltinImport:off - Node's fs API keeps the staging copy synchronous and local.
// @effect-diagnostics globalErrorInEffectCatch:off - staging probe is a CLI diagnostic boundary; the message carries the cause inline.
// @effect-diagnostics globalErrorInEffectFailure:off - same reason: operator-facing failure text, not a domain error channel.
// @effect-diagnostics preferSchemaOverJson:off - writes the probe package.json to disk; untyped filesystem JSON.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ChildProcess } from "effect/unstable/process";

import { HostProcessArchitecture, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import serverPackageJson from "../../apps/server/package.json" with { type: "json" };

import { OrchestrationBundleDistMissingError, OrchestrationBundleProbeError } from "./t3team-orchestration-bundle-errors.ts";
import { selectCliRuntimeExternalDependencies } from "./cli-external-packages.ts";
import { resolveCatalogDependencies } from "./resolve-catalog.ts";
import { PROBE_SOURCE } from "./t3team-orchestration-bundle-workflows.ts";
import { assertAsarClosure, assertStagingTreeClosure, runCommand, spawnAndCollect } from "./t3team-orchestration-bundle-closure.ts";
import {
  readWorkspaceConfig,
  resolveFffNativeDependencies,
  type BuildArch,
  type BuildPlatform,
} from "../build-desktop-artifact.ts";
import { stageAuthoringTypes } from "./t3team-authoring-types.ts";


interface CheckCliInput {
  readonly distDir: Option.Option<string>;
  readonly keepDir: Option.Option<boolean>;
  readonly verbose: Option.Option<boolean>;
  readonly asarPath: Option.Option<string>;
}

const hostPlatformToBuildPlatform = (platform: string): typeof BuildPlatform.Type =>
  platform === "darwin" ? "mac" : platform === "win32" ? "win" : "linux";

const hostArchToBuildArch = (arch: string): typeof BuildArch.Type =>
  arch === "arm64" ? "arm64" : "x64";

export const checkOrchestrationBundle = Effect.fn("checkOrchestrationBundle")(function* (
  input: CheckCliInput,
) {
  const distDirFlag = Option.getOrUndefined(input.distDir);
  const keepDir = Option.getOrElse(input.keepDir, () => false);
  const verbose = Option.getOrElse(input.verbose, () => false);
  const asarPathFlag = Option.getOrUndefined(input.asarPath);

  const repoRoot = NodePath.resolve(NodePath.dirname(new URL(import.meta.url).pathname), "..");
  const distDir = NodePath.resolve(
    distDirFlag ?? NodePath.join(repoRoot, "apps", "server", "dist"),
  );
  if (!NodeFS.existsSync(NodePath.join(distDir, "t3team-bin.mjs"))) {
    return yield* new OrchestrationBundleDistMissingError({ distDir });
  }

  const hostPlatform = yield* HostProcessPlatform;
  const hostArchitecture = yield* HostProcessArchitecture;
  const platform = hostPlatformToBuildPlatform(hostPlatform);
  const arch = hostArchToBuildArch(hostArchitecture);

  // The probe tree: the emitted dist plus a production install of exactly the
  // runtime-external closure the bundle loads from disk, plus the curated
  // authoring types the desktop build stages into the asar.
  const stagingDir = keepDir
    ? NodePath.join(repoRoot, ".orchestration-bundle-check")
    : yield* Effect.tryPromise({
        try: () =>
          NodeFS.promises.mkdtemp(NodePath.join(NodeOS.tmpdir(), "orchestration-bundle-check-")),
        catch: (cause) => new Error(`Could not create the staging directory: ${String(cause)}`),
      });
  if (keepDir) NodeFS.rmSync(stagingDir, { recursive: true, force: true });
  NodeFS.mkdirSync(stagingDir, { recursive: true });

  try {
    const workspaceConfig = yield* readWorkspaceConfig(repoRoot);
    const workspaceCatalog = workspaceConfig.catalog ?? {};
    const resolvedServerDependencies = resolveCatalogDependencies(
      serverPackageJson.dependencies,
      workspaceCatalog,
      "apps/server",
    );
    const runtimeExternals = selectCliRuntimeExternalDependencies(resolvedServerDependencies);
    const fffVersion = serverPackageJson.dependencies["@ff-labs/fff-node"];
    const probeDependencies = {
      ...runtimeExternals,
      ...resolveFffNativeDependencies(platform, arch, fffVersion),
      // effect is inlined into the bundle, so it is not a runtime external —
      // but the asar's node_modules carries it (declared server dependency),
      // and the staged authoring types resolve their effect imports against
      // it. The probe tree must mirror the asar.
      effect: resolvedServerDependencies["effect"],
    };

    NodeFS.writeFileSync(
      NodePath.join(stagingDir, "package.json"),
      `${JSON.stringify(
        {
          name: "orchestration-bundle-check",
          version: "0.0.0",
          private: true,
          dependencies: probeDependencies,
        },
        null,
        2,
      )}\n`,
    );
    // pnpm 11 fails the install (non-zero exit) when a dependency's build
    // script is not explicitly allowed; the native prebuilds need theirs to
    // run, matching the desktop build's staged allowBuilds.
    NodeFS.writeFileSync(
      NodePath.join(stagingDir, "pnpm-workspace.yaml"),
      ["allowBuilds:", "  msgpackr-extract: true", "  node-pty: true", ""].join("\n"),
    );

    yield* Effect.log(
      `[orchestration-bundle] Staging runtime externals (${Object.keys(probeDependencies).join(", ")})...`,
    );
    const installCommand = yield* resolveSpawnCommand("vp", ["install", "--prod"]);
    yield* runCommand(
      ChildProcess.make(installCommand.command, installCommand.args, {
        cwd: stagingDir,
        shell: installCommand.shell,
      }),
      { label: "vp install --prod (orchestration bundle check)", verbose },
    );

    yield* stageAuthoringTypes({
      repoRoot,
      nodeModulesDir: NodePath.join(stagingDir, "node_modules"),
      workspaceCatalog,
      includeTypeScript: true,
    });

    NodeFS.cpSync(distDir, NodePath.join(stagingDir, "dist"), { recursive: true });

    // The staging tree mirrors the asar's typechecker closure: assert the
    // pieces electron-builder's hardcoded .d.ts filters strip (and the
    // afterPack hook re-injects) are present here, and that the curated
    // authoring types carry no pnpm-protocol specs.
    assertStagingTreeClosure(stagingDir);
    if (asarPathFlag !== undefined) {
      assertAsarClosure(asarPathFlag);
      yield* Effect.log(`[orchestration-bundle] asar closure OK: ${asarPathFlag}`);
    }

    yield* Effect.log("[orchestration-bundle] Running the probe against the emitted bundle...");
    const probeCommand = yield* resolveSpawnCommand("node", []);
    const probe = yield* spawnAndCollect(
      ChildProcess.make(
        probeCommand.command,
        [
          ...probeCommand.args,
          "--input-type=module",
          "--eval",
          PROBE_SOURCE,
          NodePath.join(stagingDir, "dist", "t3team-bin.mjs"),
        ],
        { cwd: stagingDir, shell: probeCommand.shell },
      ),
    );
    if (probe.exitCode !== 0) {
      return yield* new OrchestrationBundleProbeError({
        exitCode: probe.exitCode,
        output: `${probe.stdout}\n${probe.stderr}`,
      });
    }
    if (verbose) yield* Effect.log(`[orchestration-bundle] ${probe.stdout.trim()}`);
    yield* Effect.log("[orchestration-bundle] OK.");
  } finally {
    if (!keepDir) NodeFS.rmSync(stagingDir, { recursive: true, force: true });
  }
});

