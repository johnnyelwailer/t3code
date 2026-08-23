#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Node's fs API keeps the staging copy synchronous and local.
/**
 * Packaged-bundle smoke check for the orchestration runtime.
 *
 * Proves, against the EMITTED server bundle, the two things the packaged app
 * cannot get any other way:
 *
 * 1. The inlined TypeScript compiler works (#57): `vp pack` bundles
 *    `typescript` into the server chunks (packages/runbook-ts/src/typescript.ts
 *    statically imports it, apps/server's pack config enables CJS shims and
 *    ships dist/lib/). This check runs the bundle from a directory with NO
 *    workspace node_modules, so a regression to externalizing typescript
 *    fails here exactly as it failed in the packaged asar.
 *
 * 2. The staged authoring types resolve (#58): the typecheck facet resolves
 *    `@t3team/sdk` + `effect/Schema` from the installation's node_modules.
 *    This check stages the same curated copies the desktop build writes into
 *    the asar (stageAuthoringTypes) and asserts a clean workflow passes and a
 *    real type error is reported — not "typecheck-unavailable".
 *
 * Usage: `node scripts/check-orchestration-bundle.ts` (build the server first:
 * `vp run build:desktop` or the server's pack task).
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as Duration from "effect/Duration";
import * as Logger from "effect/Logger";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { HostProcessArchitecture, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import serverPackageJson from "../apps/server/package.json" with { type: "json" };

import { selectCliRuntimeExternalDependencies } from "./lib/cli-external-packages.ts";
import { resolveCatalogDependencies } from "./lib/resolve-catalog.ts";
import {
  resolveFffNativeDependencies,
  stageAuthoringTypes,
  type BuildArch,
  type BuildPlatform,
} from "./build-desktop-artifact.ts";

const PROBE_TIMEOUT = Duration.seconds(180);

export class OrchestrationBundleProbeError extends Schema.TaggedErrorClass<OrchestrationBundleProbeError>()(
  "OrchestrationBundleProbeError",
  { exitCode: Schema.Number, output: Schema.String },
) {
  override get message(): string {
    return `The orchestration bundle probe failed (exit ${this.exitCode}). Output:\n${this.output}`;
  }
}

export class OrchestrationBundleDistMissingError extends Schema.TaggedErrorClass<OrchestrationBundleDistMissingError>()(
  "OrchestrationBundleDistMissingError",
  { distDir: Schema.String },
) {
  override get message(): string {
    return `The server dist directory ${this.distDir} does not exist. Build the server first (vp run build:desktop).`;
  }
}

interface CheckCliInput {
  readonly distDir: Option.Option<string>;
  readonly keepDir: Option.Option<boolean>;
  readonly verbose: Option.Option<boolean>;
}

const hostPlatformToBuildPlatform = (platform: string): typeof BuildPlatform.Type =>
  platform === "darwin" ? "mac" : platform === "win32" ? "win" : "linux";

const hostArchToBuildArch = (arch: string): typeof BuildArch.Type =>
  arch === "arm64" ? "arm64" : "x64";

// The workflow bodies the probe runs through the bundle. CLEAN is the same
// shape the SDK's typecheck tests use; BAD breaks one argument type so the
// checker must report ts2345.
const CLEAN_WORKFLOW = `import { Schema } from "effect";
import { agent, getArgs } from "@t3team/sdk";

export const Inputs = Schema.Struct({ topic: Schema.String });
export const meta = { name: "smoke.clean", inputs: Inputs } as const;

export default async function run() {
  const input = Schema.decodeUnknownSync(Inputs)(getArgs());
  const summary = await agent(\`summarize \${input.topic}\`, { capabilities: "inherit" });
  return { summary };
}
`;
const BAD_WORKFLOW = CLEAN_WORKFLOW.replace(
  "await agent(`summarize ${input.topic}`",
  "await agent(42",
);

const PROBE_SOURCE = `
const { precheckWorkflowSource, auditWorkflowSourceStatic } = await import(
  process.argv[1]
);

const CLEAN = ${JSON.stringify(CLEAN_WORKFLOW)};
const BAD = ${JSON.stringify(BAD_WORKFLOW)};

// #57: the inlined compiler parses and transpiles from the bundle.
const precheckError = precheckWorkflowSource(CLEAN);
if (precheckError !== null) {
  throw new Error("precheck rejected a valid workflow: " + precheckError.slice(0, 300));
}

// #58: the typecheck facet resolves the staged authoring types and passes a
// clean workflow (no "types" findings, and no typecheck-unavailable).
const cleanFindings = auditWorkflowSourceStatic(
  { absolutePath: "/probe/clean.ts", sourceText: CLEAN },
  { typecheck: true },
);
const cleanTypes = cleanFindings.filter((f) => f.facet === "types");
if (cleanTypes.length > 0) {
  throw new Error("clean workflow produced type findings: " + JSON.stringify(cleanTypes));
}

// #58: a real type error is reported as a ts diagnostic, not a
// typecheck-unavailable degradation.
const badFindings = auditWorkflowSourceStatic(
  { absolutePath: "/probe/bad.ts", sourceText: BAD },
  { typecheck: true },
);
const badTypes = badFindings.filter((f) => f.facet === "types");
if (!badTypes.some((f) => f.rule === "ts2345")) {
  throw new Error("expected ts2345 for the wrong argument type, got: " + JSON.stringify(badTypes));
}

console.log("orchestration bundle probe: OK (inlined typescript + staged authoring types)");
`;

const checkOrchestrationBundle = Effect.fn("checkOrchestrationBundle")(function* (
  input: CheckCliInput,
) {
  const distDirFlag = Option.getOrUndefined(input.distDir);
  const keepDir = Option.getOrElse(input.keepDir, () => false);
  const verbose = Option.getOrElse(input.verbose, () => false);

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
    const workspaceCatalog = readWorkspaceCatalog(repoRoot);
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

function readWorkspaceCatalog(repoRoot: string): Record<string, string> {
  const raw = NodeFS.readFileSync(NodePath.join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  const match = raw.match(/^catalog:\s*\n((?:\s{2,}\S.*\n?)*)/m);
  const catalog: Record<string, string> = {};
  if (match?.[1]) {
    for (const line of match[1].split("\n")) {
      const entry = line.match(/^\s{2}"?([^":]+)"?:\s*(.+?)\s*$/);
      if (entry?.[1] && entry[2]) catalog[entry[1]] = entry[2].replace(/^"|"$/g, "");
    }
  }
  return catalog;
}

const collectStreamAsString = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  Stream.runCollect(stream).pipe(Effect.map((chunks) => Buffer.concat(chunks).toString("utf8")));

const spawnAndCollect = Effect.fn("spawnAndCollect")(function* (command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(command);
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      collectStreamAsString(child.stdout),
      collectStreamAsString(child.stderr),
      child.exitCode.pipe(Effect.map(Number)),
    ],
    { concurrency: "unbounded" },
  );
  return { stdout, stderr, exitCode } as const;
});

const runCommand = Effect.fn("runCommand")(function* (
  command: ChildProcess.Command,
  options: { readonly label: string; readonly verbose: boolean },
) {
  const result = yield* spawnAndCollect(command).pipe(Effect.timeout(PROBE_TIMEOUT));
  if (options.verbose && (result.stdout.length > 0 || result.stderr.length > 0)) {
    yield* Effect.log(`${options.label}:\n${result.stdout}${result.stderr}`);
  }
  if (result.exitCode !== 0) {
    return yield* new OrchestrationBundleProbeError({
      exitCode: result.exitCode,
      output: `${options.label} failed:\n${result.stdout}\n${result.stderr}`,
    });
  }
});

const checkOrchestrationBundleCli = Command.make("check-orchestration-bundle", {
  distDir: Flag.string("dist-dir").pipe(
    Flag.withDescription("Server dist directory (default: apps/server/dist)."),
    Flag.optional,
  ),
  keepDir: Flag.boolean("keep-dir").pipe(
    Flag.withDescription("Keep the staging directory for inspection."),
    Flag.optional,
  ),
  verbose: Flag.boolean("verbose").pipe(
    Flag.withDescription("Stream subprocess output."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription(
    "Prove the emitted server bundle's orchestration runtime works from an isolated staged tree (inlined typescript + staged authoring types).",
  ),
  Command.withHandler((input) => checkOrchestrationBundle(input)),
);

const cliRuntimeLayer = Layer.mergeAll(Logger.layer([Logger.consolePretty()]), NodeServices.layer);

if (import.meta.main) {
  Command.run(checkOrchestrationBundleCli, { version: "0.0.0" }).pipe(
    Effect.scoped,
    Effect.provide(cliRuntimeLayer),
    NodeRuntime.runMain,
  );
}
