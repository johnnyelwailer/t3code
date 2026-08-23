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

import * as Asar from "@electron/asar";
import { HostProcessArchitecture, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import serverPackageJson from "../apps/server/package.json" with { type: "json" };

import { selectCliRuntimeExternalDependencies } from "./lib/cli-external-packages.ts";
import { resolveCatalogDependencies } from "./lib/resolve-catalog.ts";
import {
  resolveFffNativeDependencies,
  type BuildArch,
  type BuildPlatform,
  TYPECHECKER_DTS_SPOT_CHECK_FILES,
} from "./build-desktop-artifact.ts";
import { AUTHORING_TYPE_PACKAGES, stageAuthoringTypes } from "./lib/authoring-types.ts";

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

export class OrchestrationBundleClosureError extends Schema.TaggedErrorClass<OrchestrationBundleClosureError>()(
  "OrchestrationBundleClosureError",
  { detail: Schema.String },
) {
  override get message(): string {
    return `The packaged typechecker closure is incomplete: ${this.detail}`;
  }
}

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

// Regression: the validator's virtual path is extensionless ("<inline>").
// TypeScript 6 routes extensionless root names through its extension-probing
// path and never asks the host for the exact name, so an override map keyed
// on "<inline>" misses and EVERY inline workflow degrades to
// "typecheck-unavailable". The virtual path must behave like a real one:
// clean body → no findings, wrong argument type → the real diagnostic.
const inlineClean = auditWorkflowSourceStatic(
  { absolutePath: "<inline>", sourceText: CLEAN },
  { typecheck: true },
);
if (inlineClean.some((f) => f.facet === "types")) {
  throw new Error("inline clean workflow produced type findings: " + JSON.stringify(inlineClean));
}
const inlineBad = auditWorkflowSourceStatic(
  { absolutePath: "<inline>", sourceText: BAD },
  { typecheck: true },
);
if (!inlineBad.some((f) => f.facet === "types" && f.rule === "ts2345")) {
  throw new Error("expected ts2345 for the inline wrong argument type, got: " + JSON.stringify(inlineBad));
}

console.log("orchestration bundle probe: OK (inlined typescript + staged authoring types + inline virtual path)");
`;

const checkOrchestrationBundle = Effect.fn("checkOrchestrationBundle")(function* (
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

// The typechecker closure the packaged app must resolve: the TypeScript lib
// declarations beside the chunks (the inlined compiler's getDefaultLibFilePath
// target), effect's declaration graph, the trimmed typescript copy's API
// typings, and the curated @t3team/sdk manifest. These are exactly the .d.ts
// files electron-builder's hardcoded filters strip from app.asar (re-injected
// by the afterPack hook) — so a missing one here means the packaged
// typechecker degrades to "typecheck-unavailable" / ts7016 on every workflow.
// The spot-check files and the authoring-type package names are imported from
// scripts/build-desktop-artifact.ts (the single source of truth the afterPack
// hook's config is written from), not re-declared here.
// The @t3team/sdk source entry point the packaged typechecker resolves (the
// package's exports["."].types target). @t3team/sdk ships .ts source, not
// compiled .d.ts, so the SOURCE file — not a .d.ts — is the closure piece.
const SDK_SOURCE_ENTRY = "node_modules/@t3team/sdk/src/t3team-sdk.index.ts";
const SDK_MANIFEST = "node_modules/@t3team/sdk/package.json";
// The authoring-type packages the packaged typechecker may resolve from the
// asar's node_modules. Their PRESENCE is the requirement (module resolution
// needs the package + its declarations/source); the manifest's dependency
// specs are NOT. RC3/#57/#58: the asar's @t3team/sdk/package.json is EXPECTED
// to still carry pnpm-protocol specs ("effect": "catalog:", "@runbook/*":
// "workspace:*") and that is HARMLESS. The packaged typechecker resolves with
// ts.ModuleResolutionKind.Bundler + ts.resolveModuleName, which reads each
// package's OWN node_modules entry (its exports/types -> .ts/.d.ts), never a
// parent's dependencies spec — so the "catalog:" spec in @t3team/sdk does not
// affect resolving `effect` (resolved via node_modules/effect, present in the
// asar). electron-builder's pnpm pass restores the original workspace
// manifests by design after curation, so the uncurated specs are the correct,
// expected asar state. Do NOT "fix" them or assert their absence: the guard
// against RC3 recurrence is the positive closure invariant below (the .d.ts/
// source files the typechecker actually resolves), not a no-leftovers check.
const ASAR_AUTHORING_TYPE_PACKAGES = AUTHORING_TYPE_PACKAGES.map(({ name }) => name);

/** No pnpm-protocol specs may survive curation in the SDK manifest. */
function assertNoWorkspaceSpecs(manifestJson: string, where: string): void {
  const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(
    manifestJson,
  ) as {
    readonly dependencies?: Record<string, unknown>;
  };
  const leftovers = Object.entries(manifest.dependencies ?? {}).filter(
    ([, spec]) =>
      typeof spec === "string" && (spec.startsWith("workspace:") || spec.startsWith("catalog:")),
  );
  if (leftovers.length > 0) {
    throw new OrchestrationBundleClosureError({
      detail:
        `${where}: ${SDK_MANIFEST} still carries pnpm-protocol specs: ` +
        leftovers.map(([name, spec]) => `${name}=${String(spec)}`).join(", "),
    });
  }
}

/**
 * Assert the probe's staging tree (which mirrors the asar) carries the full
 * typechecker closure. Fails the probe when a piece the packaged typechecker
 * resolves against is missing or uncurated.
 */
function assertStagingTreeClosure(stagingDir: string): void {
  const required = TYPECHECKER_DTS_SPOT_CHECK_FILES.map((file) =>
    NodePath.join(stagingDir, file),
  );
  for (const file of required) {
    if (!NodeFS.existsSync(file)) {
      throw new OrchestrationBundleClosureError({
        detail: `staging tree is missing the typechecker closure file: ${file}`,
      });
    }
  }
  assertNoWorkspaceSpecs(
    NodeFS.readFileSync(NodePath.join(stagingDir, SDK_MANIFEST), "utf8"),
    "staging tree",
  );
}

/**
 * Positive-invariant guard for the emitted app.asar (RC3/#57/#58): assert the
 * asar carries the full typechecker closure the packaged app resolves against
 * — the @t3team/sdk source entry point, the effect/typescript/lib .d.ts files
 * electron-builder strips (re-injected by the afterPack hook), and the
 * authoring-type packages. This is the desktop-build verification for the
 * packaging gap: run it with `--asar <path to app.asar>` after a desktop
 * build. It asserts PRESENCE of the closure, NOT curation state — the
 * @t3team/sdk manifest's pnpm-protocol specs (workspace: and catalog:) are
 * expected and harmless
 * (see ASAR_AUTHORING_TYPE_PACKAGES).
 */
function assertAsarClosure(asarPath: string): void {
  if (!NodeFS.existsSync(asarPath)) {
    throw new OrchestrationBundleClosureError({ detail: `asar not found: ${asarPath}` });
  }
  // listPackage prefixes every path with "/"; normalize to asar-relative.
  const listing = Asar.listPackage(asarPath, { isPack: false }).map((entry) =>
    entry.startsWith("/") ? entry.slice(1) : entry,
  );
  const required = [
    SDK_SOURCE_ENTRY,
    ...TYPECHECKER_DTS_SPOT_CHECK_FILES,
  ];
  const missing = required.filter((file) => !listing.includes(file));
  if (missing.length > 0) {
    throw new OrchestrationBundleClosureError({
      detail: `asar is missing the typechecker closure files: ${missing.join(", ")}`,
    });
  }
  // The authoring-type packages must be present (the typechecker resolves
  // against them). Curation state is deliberately NOT asserted here — the
  // @t3team/sdk manifest's pnpm-protocol specs (workspace: and catalog:) are
  // expected and harmless; see ASAR_AUTHORING_TYPE_PACKAGES.
  const missingPackages = ASAR_AUTHORING_TYPE_PACKAGES.filter(
    (name) => !listing.includes(`node_modules/${name}/package.json`),
  );
  if (missingPackages.length > 0) {
    throw new OrchestrationBundleClosureError({
      detail: `asar is missing the authoring-type packages: ${missingPackages.join(", ")}`,
    });
  }
}

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
  asarPath: Flag.string("asar").pipe(
    Flag.withDescription(
      "Also assert this emitted app.asar carries the typechecker closure (the .d.ts files electron-builder strips) and the curated authoring types.",
    ),
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
