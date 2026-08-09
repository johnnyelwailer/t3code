/**
 * `createOpenCodeHarness` host capability, plus the first-class pack-driver
 * identity built on top of it.
 *
 * `makeOpenCodeHarnessCapability` lets a pack driver compose the reviewed host
 * OpenCode harness (real `OpenCodeDriver.create` under the ambient runtime
 * context, harness resources tied to a child of the instance scope), handing
 * back a `PackProviderInstance` the pack can decorate. Outer half of the
 * accepted-for-v1 Effect -> Promise -> Effect double bridge.
 *
 * `makeOpenCodeHarnessDriver` / `adaptOpenCodeHarnessSnapshot` expose that
 * same OpenCode runtime as a standalone `ProviderDriver` under a pack-defined
 * identity, restamping snapshot/adapter payloads and hiding built-in models.
 *
 * @module t3team-pack-driverHarness
 */
import {
  OpenCodeSettings,
  ProviderInstanceId,
  type ProviderDriverKind,
  type ProviderInstanceEnvironment,
  type ProviderSessionStartInput,
  type ServerProvider,
} from "@t3tools/contracts";
import type { PackHostCapabilities } from "@t3team/packs";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "./provider/ProviderDriver.ts";
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

/**
 * Exposes the reviewed OpenCode runtime behind a pack-defined provider identity.
 * The pack supplies data only; executable driver code remains owned by the host.
 */
export function makeOpenCodeHarnessDriver(input: {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
}): ProviderDriver<OpenCodeSettings, OpenCodeDriverEnv> {
  const stampSnapshot = (snapshot: ServerProvider): ServerProvider =>
    adaptOpenCodeHarnessSnapshot(snapshot, input.driverKind);

  return {
    ...OpenCodeDriver,
    driverKind: input.driverKind,
    metadata: { ...OpenCodeDriver.metadata, displayName: input.displayName },
    create: (createInput) =>
      OpenCodeDriver.create(createInput).pipe(
        Effect.map((instance) => {
          const continuationIdentity = defaultProviderContinuationIdentity({
            driverKind: input.driverKind,
            instanceId: instance.instanceId,
          });
          const snapshot = {
            ...instance.snapshot,
            getSnapshot: instance.snapshot.getSnapshot.pipe(Effect.map(stampSnapshot)),
            refresh: instance.snapshot.refresh.pipe(Effect.map(stampSnapshot)),
            streamChanges: instance.snapshot.streamChanges.pipe(Stream.map(stampSnapshot)),
          };
          const adapter = {
            ...instance.adapter,
            provider: input.driverKind,
            startSession: (startInput: ProviderSessionStartInput) =>
              instance.adapter
                .startSession(startInput)
                .pipe(Effect.map((session) => ({ ...session, provider: input.driverKind }))),
            listSessions: () =>
              instance.adapter
                .listSessions()
                .pipe(
                  Effect.map((sessions) =>
                    sessions.map((session) => ({ ...session, provider: input.driverKind })),
                  ),
                ),
            streamEvents: instance.adapter.streamEvents.pipe(
              Stream.map((event) => ({ ...event, provider: input.driverKind })),
            ),
          };
          return {
            ...instance,
            driverKind: input.driverKind,
            continuationIdentity,
            snapshot,
            adapter,
          } satisfies ProviderInstance;
        }),
      ),
  };
}

export function adaptOpenCodeHarnessSnapshot(
  snapshot: ServerProvider,
  driverKind: ProviderDriverKind,
): ServerProvider {
  return {
    ...snapshot,
    driver: driverKind,
    models: snapshot.models.filter((model) => model.isCustom),
  };
}
