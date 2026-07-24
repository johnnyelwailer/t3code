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
import { fixtureCommand } from "./cli/t3work-fixture.ts";
import {
  runT3workServerCommand,
  t3workServeCommand,
  t3workStartCommand,
} from "./cli/t3work-server.ts";

const CliRuntimeLayer = Layer.mergeAll(NodeServices.layer, NetService.layer);

export const cli = Command.make("t3work", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription("Run the T3work server."),
  Command.withHandler((flags) => runT3workServerCommand(flags)),
  Command.withSubcommands([
    t3workStartCommand,
    t3workServeCommand,
    authCommand,
    projectCommand,
    fixtureCommand,
  ]),
);

if (import.meta.main) {
  Command.run(cli, { version: packageJson.version }).pipe(
    Effect.scoped,
    Effect.provide(CliRuntimeLayer),
    NodeRuntime.runMain,
  );
}
