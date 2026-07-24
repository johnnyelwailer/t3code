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
import {
  runT3TeamServerCommand,
  t3teamServeCommand,
  t3teamStartCommand,
} from "./cli/t3team-server.ts";

const CliRuntimeLayer = Layer.mergeAll(NodeServices.layer, NetService.layer);

export const cli = Command.make("t3team", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription("Run the T3Team server."),
  Command.withHandler((flags) => runT3TeamServerCommand(flags)),
  Command.withSubcommands([t3teamStartCommand, t3teamServeCommand, authCommand, projectCommand]),
);

if (import.meta.main) {
  Command.run(cli, { version: packageJson.version }).pipe(
    Effect.scoped,
    Effect.provide(CliRuntimeLayer),
    NodeRuntime.runMain,
  );
}
