import * as Effect from "effect/Effect";
import { Command, GlobalFlag } from "effect/unstable/cli";

import { ServerConfig, type StartupPresentation } from "../config.ts";
import { runServer } from "../server.ts";
import { workflowAdmissionQueue } from "../t3team-workflowAdmissionQueue.ts";
import { setWorkflowEphemeralConcurrencyPolicy } from "../t3team-workflowEphemeralConcurrencyPolicy.ts";
import {
  type CliServerFlags,
  resolveEphemeralWorkflowMaxActiveStepsOverride,
  resolveEphemeralWorkflowMaxLiveRunsOverride,
  resolveServerConfig,
  sharedServerCommandFlags,
} from "./config.ts";

export const runServerCommand = (
  flags: CliServerFlags,
  options?: {
    readonly startupPresentation?: StartupPresentation;
  },
) =>
  Effect.gen(function* () {
    const logLevel = yield* GlobalFlag.LogLevel;
    const config = yield* resolveServerConfig(flags, logLevel, options);
    // An explicit operator override (CLI flag or env var) always wins — this binary never
    // activates a pack (see `cli/t3team-server.ts`), so applying it here is simply the final
    // word. `setWorkflowEphemeralConcurrencyPolicy` merges, so passing only the fields that
    // actually have an override never clobbers the other one.
    const ephemeralWorkflowMaxActiveSteps =
      yield* resolveEphemeralWorkflowMaxActiveStepsOverride(flags);
    const ephemeralWorkflowMaxLiveRuns = yield* resolveEphemeralWorkflowMaxLiveRunsOverride(flags);
    if (ephemeralWorkflowMaxActiveSteps !== undefined || ephemeralWorkflowMaxLiveRuns !== undefined) {
      setWorkflowEphemeralConcurrencyPolicy({
        ...(ephemeralWorkflowMaxActiveSteps === undefined
          ? {}
          : { maxActiveSteps: ephemeralWorkflowMaxActiveSteps }),
        ...(ephemeralWorkflowMaxLiveRuns === undefined
          ? {}
          : { maxLiveRuns: ephemeralWorkflowMaxLiveRuns }),
      });
      workflowAdmissionQueue.reconfigure();
    }
    return yield* runServer.pipe(Effect.provideService(ServerConfig, config));
  });

export const startCommand = Command.make("start", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription("Run the T3 Code server."),
  Command.withHandler((flags) => runServerCommand(flags)),
);

export const serveCommand = Command.make("serve", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription(
    "Run the T3 Code server without opening a browser and print headless pairing details.",
  ),
  Command.withHandler((flags) =>
    runServerCommand(flags, {
      startupPresentation: "headless",
    }),
  ),
);
