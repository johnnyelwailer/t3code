/**
 * Typechecker-closure assertions + subprocess helpers for the
 * orchestration-bundle probe (split out of
 * scripts/t3team-check-orchestration-bundle.ts for the additive guard's LOC
 * ceiling).
 */
// @effect-diagnostics nodeBuiltinImport:off - the closure asserts read the staged tree/asar with sync fs.
// @effect-diagnostics globalErrorInEffectCatch:off - subprocess probe is a CLI diagnostic boundary; the message carries the cause inline.
// @effect-diagnostics globalErrorInEffectFailure:off - same reason: operator-facing failure text, not a domain error channel.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as Asar from "@electron/asar";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  OrchestrationBundleClosureError,
  OrchestrationBundleProbeError,
} from "./t3team-orchestration-bundle-errors.ts";
import { AUTHORING_TYPE_PACKAGES } from "./t3team-authoring-types.ts";
import { TYPECHECKER_DTS_SPOT_CHECK_FILES } from "../build-desktop-artifact.ts";

const PROBE_TIMEOUT = Duration.seconds(180);

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
export function assertNoWorkspaceSpecs(manifestJson: string, where: string): void {
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
export function assertStagingTreeClosure(stagingDir: string): void {
  // The spot-check files are asar-relative; the staging tree places the
  // server's dist at its root (stagingDir/dist), so the apps/server/ prefix
  // drops off.
  const required = TYPECHECKER_DTS_SPOT_CHECK_FILES.map((file) =>
    NodePath.join(stagingDir, file.replace("apps/server/", "")),
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
export function assertAsarClosure(asarPath: string): void {
  if (!NodeFS.existsSync(asarPath)) {
    throw new OrchestrationBundleClosureError({ detail: `asar not found: ${asarPath}` });
  }
  // listPackage prefixes every path with "/"; normalize to asar-relative.
  const listing = new Set(
    Asar.listPackage(asarPath, { isPack: false }).map((entry) =>
      entry.startsWith("/") ? entry.slice(1) : entry,
    ),
  );
  const required = [SDK_SOURCE_ENTRY, ...TYPECHECKER_DTS_SPOT_CHECK_FILES];
  const missing = required.filter((file) => !listing.has(file));
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
    (name) => !listing.has(`node_modules/${name}/package.json`),
  );
  if (missingPackages.length > 0) {
    throw new OrchestrationBundleClosureError({
      detail: `asar is missing the authoring-type packages: ${missingPackages.join(", ")}`,
    });
  }
}

const collectStreamAsString = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  Stream.runCollect(stream).pipe(Effect.map((chunks) => Buffer.concat(chunks).toString("utf8")));

export const spawnAndCollect = Effect.fn("spawnAndCollect")(function* (
  command: ChildProcess.Command,
) {
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

export const runCommand = Effect.fn("runCommand")(function* (
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
