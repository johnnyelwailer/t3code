/**
 * `createOpenCodeHarness` host capability.
 *
 * Lets a pack driver compose the reviewed host OpenCode harness: it runs the
 * real `OpenCodeDriver.create` under the ambient runtime context captured by
 * the bridge, ties the harness resources to a child of the instance scope,
 * and hands the pack a `PackProviderInstance` (Promise / AsyncIterable) it can
 * decorate. Outer half of the accepted-for-v1 Effect -> Promise -> Effect
 * double bridge.
 *
 * @module t3team-pack-driverHarness
 */
import {
  OpenCodeSettings,
  ProviderInstanceId,
  type ProviderInstanceEnvironment,
} from "@t3tools/contracts";
import type { PackHostCapabilities } from "@t3team/packs";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import { OpenCodeDriver, type OpenCodeDriverEnv } from "./provider/Drivers/OpenCodeDriver.ts";
import { openCodeUpstreamConfigContent } from "./t3team-pack-aiProvider.ts";
import { providerInstanceToPack } from "./t3team-pack-driverHarnessWrap.ts";

const decodeOpenCodeSettings = Schema.decodeUnknownSync(OpenCodeSettings);

/**
 * @param ambient Runtime context physically carrying `OpenCodeDriverEnv` (the
 *   registry provided the full built-in driver context to every driver's
 *   `create`). Typed `never` at the bridge boundary; narrowed here where the
 *   OpenCode services are actually required.
 */
export const makeOpenCodeHarnessCapability = (input: {
  readonly ambient: Context.Context<never>;
  readonly scope: Scope.Scope;
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly environment: ProviderInstanceEnvironment;
}): PackHostCapabilities["createOpenCodeHarness"] => {
  const ambient = input.ambient as Context.Context<OpenCodeDriverEnv>;
  return (options) => {
    const settings = decodeOpenCodeSettings({
      enabled: true,
      configContent: openCodeUpstreamConfigContent({
        provider: options.provider,
        credentialEnv: options.credentialEnv,
        defaultModel: options.defaultModel,
      }),
      customModels: options.provider.models.map((model) => `${options.provider.id}/${model.id}`),
    });
    const build = Effect.gen(function* () {
      // Child of the instance scope so harness resources release on teardown.
      const harnessScope = yield* Scope.fork(input.scope);
      return yield* OpenCodeDriver.create({
        instanceId: input.instanceId,
        displayName: input.displayName,
        configurationSource: "pack",
        environment: input.environment,
        enabled: true,
        config: settings,
      }).pipe(
        Effect.provideService(Scope.Scope, harnessScope),
        // If create fails/interrupts after the fork, release the partial
        // acquisition immediately — the pack may swallow the rejection.
        Effect.onError(() => Scope.close(harnessScope, Exit.void).pipe(Effect.ignore)),
      );
    });
    return Effect.runPromiseWith(ambient)(build).then((instance) =>
      providerInstanceToPack(instance, input.ambient),
    );
  };
};
