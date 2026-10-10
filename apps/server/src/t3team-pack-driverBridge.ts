/**
 * Pack provider-driver bridge.
 *
 * Adapts a pack `PackProviderDriverDefinition` (Promise / AsyncIterable) into
 * the host's Effect-based `ProviderDriver`. The bridged driver is typed
 * `R = never` so it slots into the hydration layer's driver array without
 * widening the required environment; at runtime the registry provides the
 * full built-in driver context to every `create`, which is what lets the
 * `createOpenCodeHarness` capability reach the real OpenCode services.
 *
 * Config is opaque (`Schema.Unknown`) — packs validate their own config.
 * `create` maps pack rejections to `ProviderDriverError`, registers the pack
 * instance's `dispose()` as a scope finalizer, and delegates the orchestration
 * adapter (`t3team-pack-driverAdapter.ts`), snapshot and text-generation
 * bridging to sibling modules.
 *
 * @module t3team-pack-driverBridge
 */
import type { PackHostCapabilities, PackProviderDriverDefinition } from "@t3team/pack-api";
import { ProviderDriverKind, type ProviderInstanceEnvironment } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ProviderContinuationRequests } from "./orchestration-v2/ProviderContinuationRequests.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { ProviderDriverError } from "./provider/Errors.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "./provider/ProviderDriver.ts";
import { makePackOrchestrationAdapter } from "./t3team-pack-driverAdapter.ts";
import { makeOpenCodeHarnessCapability } from "./t3team-pack-driverHarness.ts";
import { makePackProviderSnapshot } from "./t3team-pack-driverSnapshotShape.ts";
import { bridgePackTextGeneration } from "./t3team-pack-textGenerationBridge.ts";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const environmentToRecord = (
  environment: ProviderInstanceEnvironment,
): Record<string, string | undefined> =>
  Object.fromEntries(environment.map((entry) => [entry.name, entry.value]));

/**
 * Read the user's global "Personality / Instructions" override
 * (`ServerSettings.agentInstructions`) from the ambient runtime context —
 * the registry provides the full built-in driver context to every `create`,
 * the same channel `createOpenCodeHarness` relies on (see
 * `t3team-pack-driverHarness.ts`). Fail-open: when the settings service is
 * absent (tests, non-provider hosts) the field is silently unset; when the
 * settings file cannot be read it warns and unsets — either way the pack
 * falls back to its built-in default, and an unreadable settings file must
 * not take a provider instance down.
 */
const readAgentInstructions = (
  ambient: Context.Context<never>,
): Effect.Effect<string | undefined> => {
  // Same ambient-context narrowing the OpenCode harness uses:
  // the registry physically provides the full built-in driver context to
  // every `create`.
  const read = Effect.gen(function* () {
    const service = yield* ServerSettingsService;
    const settings = yield* service.getSettings;
    return settings.agentInstructions;
  }).pipe(
    Effect.map((value) => (value ? value : undefined)),
    Effect.catch((cause) =>
      Effect.logWarning(
        "Could not read server settings; the pack driver will use its default agent personality.",
        { cause },
      ).pipe(Effect.as(undefined)),
    ),
  );
  const context = ambient as Context.Context<ServerSettingsService>;
  return Effect.promise(() => Effect.runPromiseWith(context)(read)).pipe(
    Effect.catchCause(() =>
      // Settings service absent from this context (tests, non-provider
      // hosts) — nothing to read, not a failure.
      Effect.succeed(undefined as string | undefined),
    ),
  );
};

/** Upper bound on a pack `dispose()` so a hung teardown cannot stall registry reconcile. */
const DISPOSE_TIMEOUT = Duration.seconds(5);

export const bridgePackProviderDriver = (
  definition: PackProviderDriverDefinition,
): ProviderDriver<unknown, never> => {
  const driverKind = ProviderDriverKind.make(definition.driver);
  return {
    driverKind,
    metadata: {
      displayName: definition.displayName,
      supportsMultipleInstances: definition.supportsMultipleInstances ?? true,
    },
    configSchema: Schema.Unknown,
    defaultConfig: () => ({}),
    create: ({
      instanceId,
      displayName,
      accentColor,
      iconDataUrl,
      configurationSource,
      environment,
      enabled,
      config,
    }) =>
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const ambient = yield* Effect.context<never>();
        const resolvedName = displayName ?? definition.displayName;
        const agentInstructions = yield* readAgentInstructions(ambient);
        const host: PackHostCapabilities = {
          createOpenCodeHarness: makeOpenCodeHarnessCapability({
            ambient,
            scope,
            driverKind,
            instanceId,
            displayName: resolvedName,
            environment,
          }),
        };
        const packInstance = yield* Effect.tryPromise({
          try: () =>
            definition.create({
              instanceId,
              displayName: resolvedName,
              config,
              environment: environmentToRecord(environment),
              host,
              ...(agentInstructions !== undefined ? { agentInstructions } : {}),
            }),
          catch: (cause) =>
            new ProviderDriverError({
              driver: definition.driver,
              instanceId,
              detail: errorDetail(cause),
              cause,
            }),
        });
        // Bound `dispose()` so a hung/rejecting teardown cannot deadlock reconcile.
        // Each open session closes (and ends its event stream) in its own session
        // scope before the instance scope runs this.
        yield* Effect.addFinalizer(() =>
          // `Effect.promise` turns a rejection into a defect; `catchCause`
          // absorbs both that and the timeout so teardown always proceeds.
          Effect.promise(() => packInstance.dispose()).pipe(
            Effect.timeout(DISPOSE_TIMEOUT),
            Effect.catchCause((cause) =>
              Effect.logWarning("Pack provider dispose() failed or timed out", {
                driver: definition.driver,
                instanceId,
                cause,
              }),
            ),
          ),
        );
        const continuationRequests = yield* ProviderContinuationRequests;
        const continuationIdentity = defaultProviderContinuationIdentity({
          driverKind,
          instanceId,
        });
        const orchestrationAdapter = makePackOrchestrationAdapter({
          adapter: packInstance.orchestration,
          driver: driverKind,
          instanceId,
          offerContinuation: continuationRequests.offer,
        });
        const snapshot = yield* makePackProviderSnapshot({
          packInstance,
          driverKind,
          instanceId,
          displayName,
          accentColor,
          iconDataUrl,
          continuationKey: continuationIdentity.continuationKey,
        });
        return {
          instanceId,
          driverKind,
          continuationIdentity,
          displayName,
          accentColor,
          iconDataUrl,
          configurationSource,
          enabled,
          snapshot,
          orchestrationAdapter,
          textGeneration: bridgePackTextGeneration(packInstance, driverKind),
        } satisfies ProviderInstance;
      }),
  };
};
