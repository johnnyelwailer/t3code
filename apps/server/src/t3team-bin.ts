// @effect-diagnostics nodeBuiltinImport:off - bootstrap env loading runs at module load, before any Effect runtime exists.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Command } from "effect/unstable/cli";

import * as NetService from "@t3tools/shared/Net";
import packageJson from "../package.json" with { type: "json" };
import { authCommand } from "./cli/auth.ts";
import { sharedServerCommandFlags } from "./cli/config.ts";
import { projectCommand } from "./cli/project.ts";
import { fixtureCommand } from "./cli/t3team-fixture.ts";
import {
  runT3TeamServerCommand,
  t3teamServeCommand,
  t3teamStartCommand,
} from "./cli/t3team-server.ts";

// Load runtime env vars written by the desktop installer (~/.t3/.env).
// These are not available in the Electron-spawned process environment.
{
  const runtimeEnvPath = join(homedir(), ".t3", ".env");
  if (existsSync(runtimeEnvPath)) {
    for (const line of readFileSync(runtimeEnvPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

const CliRuntimeLayer = Layer.mergeAll(NodeServices.layer, NetService.layer);

export const cli = Command.make("t3team", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription("Run the T3Team server."),
  Command.withHandler((flags) => runT3TeamServerCommand(flags)),
  Command.withSubcommands([
    t3teamStartCommand,
    t3teamServeCommand,
    authCommand,
    projectCommand,
    fixtureCommand,
  ]),
);

// Packaged-bundle smoke surface: scripts/check-orchestration-bundle.ts imports
// these from the emitted dist to prove the inlined TypeScript compiler and the
// staged authoring types work from the asar context, where no workspace
// node_modules is reachable.
export { precheckWorkflowSource } from "./t3team-workflowSourcePrecheck.ts";
export { auditWorkflowSourceStatic } from "@t3team/sdk";

if (import.meta.main) {
  Command.run(cli, { version: packageJson.version }).pipe(
    Effect.scoped,
    Effect.provide(CliRuntimeLayer),
    NodeRuntime.runMain,
  );
}
