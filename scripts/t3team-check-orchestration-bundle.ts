#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Node's fs API keeps the staging copy synchronous and local.
// @effect-diagnostics globalErrorInEffectCatch:off - staging probe is a CLI diagnostic boundary; the message carries the cause inline.
// @effect-diagnostics globalErrorInEffectFailure:off - same reason: operator-facing failure text, not a domain error channel.
// @effect-diagnostics preferSchemaOverJson:off - writes the probe package.json to disk; untyped filesystem JSON.
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
 * Usage: `node scripts/t3team-check-orchestration-bundle.ts` (build the server first:
 * `vp run build:desktop` or the server's pack task).
 */


import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Logger from "effect/Logger";
import { Command, Flag } from "effect/unstable/cli";

import { checkOrchestrationBundle } from "./lib/t3team-orchestration-bundle-check.ts";

export {
  OrchestrationBundleClosureError,
  OrchestrationBundleDistMissingError,
  OrchestrationBundleProbeError,
} from "./lib/t3team-orchestration-bundle-errors.ts";

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
