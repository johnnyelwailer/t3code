import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { FetchHttpClient, HttpClient } from "effect/http";
import { packAccounts } from "./account/t3team-packAccounts.ts";
import { makeAccountOAuthClient } from "./account/t3team-AccountOAuth.ts";
import { hostServiceDefinitions } from "./t3team-hostServiceRegistry.ts";
import { resolveBaseDir } from "./os-jank.ts";
import { distributionHomeDirName } from "./t3team-distribution-homeDir.ts";
import { hostServiceError } from "./t3team-hostServiceError.ts";
import { resolveFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import { inspectConfiguredWorkspacePacks } from "./t3team-pack-host.ts";
import { loadPackHostServices } from "./t3team-pack-hostServices.ts";
import { loadPackFeatureFlags } from "./t3team-pack-featureFlags.ts";

export async function runHostServiceCommand(args: ReadonlyArray<string>) {
  const packs = await inspectConfiguredWorkspacePacks(process.env.T3TEAM_PACKS_DIR);
  await loadPackHostServices(packs);
  await loadPackFeatureFlags(packs);
  const command = hostServiceDefinitions().find(
    (definition) => definition.command?.name === args[0],
  )?.command;
  if (!command) return false;
  await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const path = yield* Path.Path;
      const directory = yield* resolveBaseDir(process.env.T3CODE_HOME, distributionHomeDirName);
      const accessToken = (accountId: string, resource: string) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const account = packAccounts().find((entry) => entry.id === accountId);
            if (!account || !Object.hasOwn(account.resources, resource))
              return yield* Effect.fail(hostServiceError("Unknown account resource"));
            const oauth = makeAccountOAuthClient({ ...account, signInResource: resource }, http);
            if (Option.isNone(oauth.requestDeviceCode))
              return yield* Effect.fail(
                hostServiceError("This account has no device-code sign-in"),
              );
            const code = yield* oauth.requestDeviceCode.value;
            process.stdout.write(`Open ${code.verification_uri} and enter ${code.user_code}\n`);
            return (yield* oauth.pollDeviceToken(code)).access_token;
          }),
        );
      yield* Effect.tryPromise({
        try: () =>
          command.run(
            {
              stateDirectory: path.join(directory, "userdata"),
              accessToken,
              featureEnabled: (key) => resolveFeatureFlag(key)?.enabled ?? false,
              write: (message) => process.stdout.write(`${message}\n`),
            },
            args.slice(1),
          ),
        catch: hostServiceError,
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.mergeAll(FetchHttpClient.layer, NodeServices.layer)),
    ),
  );
  return true;
}
