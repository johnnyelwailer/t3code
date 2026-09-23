/**
 * Test helpers for constructing a `ProviderAdapterRegistryShape` mock from a
 * kind-keyed adapter map.
 *
 * @module provider/testUtils/providerAdapterRegistryMock
 */
import {
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";

import { ProviderUnsupportedError, type ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import type { ProviderAdapterRegistryShape } from "../Services/ProviderAdapterRegistry.ts";

export type KindAdapterMap = Partial<
  Record<ProviderDriverKind, ProviderAdapterShape<ProviderAdapterError>>
>;

/**
 * Optional per-kind routing-info overrides for the mock. Currently only
 * the host-owned turn inactivity watchdog budget (GHE #113) is exposed —
 * tests that exercise the per-provider watchdog timeout set it here.
 */
export interface AdapterRegistryMockOptions {
  readonly turnInactivityTimeoutSeconds?: Partial<Record<ProviderDriverKind, number>>;
}

/**
 * Build a `ProviderAdapterRegistryShape` from a kind-keyed adapter map.
 * Every adapter present in the map is addressable through its default
 * provider instance id.
 */
export const makeAdapterRegistryMock = (
  adapters: KindAdapterMap,
  options?: AdapterRegistryMockOptions,
): ProviderAdapterRegistryShape => {
  const byInstanceId = new Map<ProviderInstanceId, ProviderAdapterShape<ProviderAdapterError>>();
  for (const [kind, adapter] of Object.entries(adapters)) {
    if (!adapter) continue;
    const driverKind = ProviderDriverKind.make(kind);
    byInstanceId.set(defaultInstanceIdForDriver(driverKind), adapter);
  }

  const getByInstance: ProviderAdapterRegistryShape["getByInstance"] = (instanceId) => {
    const adapter = byInstanceId.get(instanceId);
    return adapter
      ? Effect.succeed(adapter)
      : Effect.fail(
          new ProviderUnsupportedError({
            provider: ProviderDriverKind.make(instanceId),
          }),
        );
  };

  return {
    getByInstance,
    getInstanceInfo: (instanceId) => {
      const adapter = byInstanceId.get(instanceId);
      if (!adapter) {
        return Effect.fail(
          new ProviderUnsupportedError({
            provider: ProviderDriverKind.make(instanceId),
          }),
        );
      }
      return Effect.succeed({
        instanceId,
        driverKind: ProviderDriverKind.make(adapter.provider),
        displayName: undefined,
        enabled: true,
        continuationIdentity: {
          driverKind: ProviderDriverKind.make(adapter.provider),
          continuationKey: `${adapter.provider}:instance:${instanceId}`,
        },
        turnInactivityTimeoutSeconds: options?.turnInactivityTimeoutSeconds?.[adapter.provider],
      });
    },
    listInstances: () => Effect.succeed(Array.from(byInstanceId.keys())),
    subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
      PubSub.subscribe(pubsub),
    ),
  };
};
