// @effect-diagnostics preferSchemaOverJson:off - CLI output is plain JSON text.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as References from "effect/References";
import { Command, Flag, GlobalFlag } from "effect/unstable/cli";

import * as ServerConfig from "../config.ts";
import { layerConfig as SqlitePersistenceLayerLive } from "../persistence/Layers/Sqlite.ts";
import { seedT3workFixtureProject } from "../t3work-fixtureProjectSeed.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import { projectLocationFlags, resolveCliAuthConfig } from "./config.ts";

const fixtureFlag = Flag.string("fixture").pipe(
  Flag.withDescription("Path to the fixture directory (metadata.json + work-items/*.json)."),
);

const workspaceFlag = Flag.string("workspace").pipe(
  Flag.withDescription("Workspace root the fixture project is ingested into."),
);

const accountFlag = Flag.string("account").pipe(
  Flag.withDescription("Fixture account name; the account id becomes `fixture:<name>`."),
  Flag.withDefault("demo"),
);

const jsonFlag = Flag.boolean("json").pipe(
  Flag.withDescription("Emit JSON instead of human-readable output."),
  Flag.withDefault(false),
);

/**
 * `t3work fixture seed` — ingest a fixture directory into a workspace through the same
 * refresh pipeline the live Atlassian sync uses. Scriptable for humans, agents and CI.
 */
export const fixtureSeedCommand = Command.make("seed", {
  ...projectLocationFlags,
  fixture: fixtureFlag,
  workspace: workspaceFlag,
  account: accountFlag,
  json: jsonFlag,
}).pipe(
  Command.withDescription("Ingest a fixture project directory into a workspace."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const logLevel = yield* GlobalFlag.LogLevel;
      const config = yield* resolveCliAuthConfig({ baseDir: flags.baseDir }, logLevel);
      const result = yield* seedT3workFixtureProject({
        fixtureRoot: flags.fixture,
        workspaceRoot: flags.workspace,
        accountName: flags.account,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(SqlitePersistenceLayerLive, WorkspacePaths.layer).pipe(
            // provideMerge, not provide: the seed effect itself reads ServerConfig,
            // so it must stay in the output context rather than being consumed by
            // the layers above it.
            Layer.provideMerge(ServerConfig.layer(config)),
            Layer.provide(Layer.succeed(References.MinimumLogLevel, "Error")),
          ),
        ),
      );
      yield* flags.json
        ? Console.log(JSON.stringify(result, null, 2))
        : Console.log(
            [
              `Seeded fixture project '${result.projectId}' from ${result.fixtureRoot}`,
              `  account:      ${result.accountId} (no Atlassian credential required)`,
              `  workspace:    ${flags.workspace}`,
              `  work items:   ${result.workItemCount}`,
              `  ingested:     ${result.refreshedKeys.join(", ")}`,
              ...(result.failedKeys.length > 0
                ? [`  failed:       ${result.failedKeys.join(", ")}`]
                : []),
            ].join("\n"),
          );
    }),
  ),
);

export const fixtureCommand = Command.make("fixture").pipe(
  Command.withDescription("Fixture-backed project sources for offline development and CI."),
  Command.withSubcommands([fixtureSeedCommand]),
);
