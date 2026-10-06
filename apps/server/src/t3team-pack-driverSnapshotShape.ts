/**
 * Pack driver snapshot service (`ServerProviderShape`) — joins pack
 * providers to upstream's provider-usage pipeline.
 *
 * `getSnapshot` / `refresh` recompute from the pack instance and attach the
 * usage limits this instance has accumulated: a pack that emits
 * `account.rate-limits.updated` runtime events reaches `applyUsageLimits`
 * through `ProviderUsageLimitsIngestion`, which merges them here exactly like
 * the built-in drivers (`applyUsageLimitsUpdate`) and republishes. A pack's
 * own `subscribeSnapshot` pushes are forwarded onto `streamChanges` too, so
 * `ProviderRegistry` sees pack changes without polling.
 *
 * @module t3team-pack-driverSnapshotShape
 */
import type { ServerProvider, ServerProviderUsageLimits } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import { makeManualOnlyProviderMaintenanceCapabilities } from "./provider/providerMaintenance.ts";
import { applyUsageLimitsUpdate } from "./provider/providerUsageLimits.ts";
import type { ServerProviderShape } from "./provider/ServerProvider.ts";
import {
  degradedServerProvider,
  packSnapshotToServerProvider,
  type SnapshotInput,
} from "./t3team-pack-driverSnapshot.ts";

export const makePackProviderSnapshot = Effect.fn("makePackProviderSnapshot")(function* (
  input: SnapshotInput,
) {
  let usageLimits: ServerProviderUsageLimits | undefined;
  const changes = yield* Effect.acquireRelease(PubSub.unbounded<ServerProvider>(), PubSub.shutdown);

  const withUsage = (provider: ServerProvider): ServerProvider =>
    usageLimits === undefined ? provider : { ...provider, usageLimits };

  const getSnapshot = Effect.gen(function* () {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    // Guards both the pack `snapshot()` call and the mapping: a throwing or
    // malformed snapshot becomes the degraded snapshot instead of escaping.
    return yield* Effect.sync(() =>
      withUsage(
        packSnapshotToServerProvider({
          ...input,
          checkedAt,
          snapshot: input.packInstance.snapshot(),
        }),
      ),
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Pack provider snapshot() failed", {
          driverKind: input.driverKind,
          instanceId: input.instanceId,
          cause,
        }).pipe(Effect.as(degradedServerProvider(input, checkedAt, Cause.squash(cause)))),
      ),
    );
  });

  const applyUsageLimits: ServerProviderShape["applyUsageLimits"] = (update) =>
    Effect.gen(function* () {
      const next = applyUsageLimitsUpdate({
        previous: usageLimits,
        update,
        checkedAt: update.checkedAt,
      });
      if (next === usageLimits) return;
      usageLimits = next;
      yield* PubSub.publish(changes, yield* getSnapshot);
    });

  const subscribe = input.packInstance.subscribeSnapshot?.bind(input.packInstance);
  if (subscribe !== undefined) {
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        // A synchronous pack callback: map and publish without leaving it.
        subscribe((snapshot) => {
          const checkedAt = DateTime.formatIso(DateTime.nowUnsafe());
          let provider: ServerProvider;
          try {
            provider = withUsage(packSnapshotToServerProvider({ ...input, checkedAt, snapshot }));
          } catch (cause) {
            provider = degradedServerProvider(input, checkedAt, cause);
          }
          PubSub.publishUnsafe(changes, provider);
        }),
      ),
      (unsubscribe) => Effect.sync(unsubscribe),
    );
  }

  return {
    // Pack providers are not package-managed: maintenance is manual-only, so the
    // capabilities are static (no cached resolution like the built-in drivers).
    resolveMaintenance: () =>
      Effect.succeed(
        makeManualOnlyProviderMaintenanceCapabilities({
          provider: input.driverKind,
          packageName: null,
        }),
      ),
    getSnapshot,
    refresh: getSnapshot,
    applyUsageLimits,
    get streamChanges() {
      return Stream.fromPubSub(changes);
    },
  } satisfies ServerProviderShape;
});
