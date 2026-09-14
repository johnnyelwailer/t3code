/**
 * Dev hooks of the provider usage-limit watcher (GHE #421, phase 2):
 * `forceExhaust` / `forceRecover` run the exact act/release paths with a
 * synthetic sample (gated behind `T3TEAM_PROVIDER_USAGE_DEV_FORCE=1`) so the
 * feature can be verified end-to-end without burning a real subscription
 * window; `getDevState` exposes the current held state + persisted rows.
 * Split out of `t3team-providerUsageWatcher.ts` for the additive LOC budget.
 *
 * @module t3team-providerUsageWatcherDevHooks
 */
import { ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { actForDriver, releaseDriver } from "./t3team-providerUsageWatcherActions.ts";
import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  ProviderUsageDevError,
  isUsageDriver,
  type ProviderUsageInstanceHold,
  type ProviderUsageWatcherDevState,
  type ProviderUsageWatcherDeps,
} from "./t3team-providerUsageWatcherTypes.ts";

/** Dev hook: force-exhaust a driver window without sampling. */
export const forceExhaust = Effect.fn("providerUsageWatcher.forceExhaust")(function* (
  deps: ProviderUsageWatcherDeps,
  devInput: {
    readonly provider?: string;
    readonly providerInstanceId?: string;
    readonly resetsInMs?: number;
    readonly threadId?: string;
  },
) {
  if (!deps.devForceEnabled) {
    return yield* Effect.fail(
      new ProviderUsageDevError({
        message: "Dev force hooks are disabled (set T3TEAM_PROVIDER_USAGE_DEV_FORCE=1 to enable).",
      }),
    );
  }
  const settings = yield* deps.settingsService.getSettings.pipe(Effect.orDie);
  const driver =
    devInput.provider !== undefined && isUsageDriver(devInput.provider)
      ? devInput.provider
      : devInput.providerInstanceId !== undefined
        ? settings.providerInstances[ProviderInstanceId.make(devInput.providerInstanceId)]?.driver
        : undefined;
  if (driver === undefined || driver === null) {
    return yield* Effect.fail(
      new ProviderUsageDevError({
        message:
          "forceExhaust needs a known usage driver (provider) or a configured provider instance (providerInstanceId).",
      }),
    );
  }
  const resetsInMs = devInput.resetsInMs ?? 5 * 60_000;
  const since = deps.nowIso();
  const resetsAt = DateTime.formatIso(
    DateTime.addDuration(DateTime.nowUnsafe(), Duration.millis(resetsInMs)),
  );
  const hold: ProviderUsageInstanceHold = {
    driver,
    since,
    resetsAt,
    instanceIds: devInput.providerInstanceId !== undefined ? [devInput.providerInstanceId] : [],
    percentUsed: 100,
  };
  deps.state.heldDrivers.set(driver, hold);
  let holdsCreated = 0;
  if (devInput.threadId !== undefined) {
    yield* deps.holds
      .upsertActiveHold({
        threadId: ThreadId.make(devInput.threadId),
        provider: ProviderDriverKind.make(driver),
        providerInstanceId:
          devInput.providerInstanceId === undefined
            ? null
            : ProviderInstanceId.make(devInput.providerInstanceId),
        since,
        resetsAt,
        autoResume: true,
        pendingTurnMessageId: null,
        releasedAt: null,
        releaseReason: null,
        updatedAt: since,
      })
      .pipe(Effect.orDie);
    holdsCreated += 1;
    yield* deps.appendActivity(
      devInput.threadId!,
      PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started,
      `Provider usage limit reached — ${driver} window exhausted (dev), turns paused`,
      { driver, since, resetsAt, autoResume: true, percentUsed: 100, forced: true },
    );
  } else {
    holdsCreated = yield* actForDriver(deps, hold);
  }
  return { holdsCreated, resetsAt };
});

/** Dev hook: force-recover every held driver (runs the real release path). */
export const forceRecover = Effect.fn("providerUsageWatcher.forceRecover")(function* (
  deps: ProviderUsageWatcherDeps,
) {
  if (!deps.devForceEnabled) {
    return yield* Effect.fail(
      new ProviderUsageDevError({
        message: "Dev force hooks are disabled (set T3TEAM_PROVIDER_USAGE_DEV_FORCE=1 to enable).",
      }),
    );
  }
  let released = 0;
  for (const driver of Array.from(deps.state.heldDrivers.keys())) {
    released += yield* releaseDriver(deps, driver, "dev-force-recover");
  }
  // Catch rows rehydrated for drivers the in-memory map does not hold.
  const remaining = [
    ...new Set((yield* deps.holds.listActive().pipe(Effect.orDie)).map((row) => row.provider)),
  ];
  for (const driver of remaining) {
    released += yield* releaseDriver(deps, driver, "dev-force-recover");
  }
  return { released };
});

/** Dev hook: current held state + persisted rows. */
export const getDevState = (
  deps: ProviderUsageWatcherDeps,
): Effect.Effect<ProviderUsageWatcherDevState> =>
  Effect.gen(function* () {
    return {
      held: [...deps.state.heldDrivers.values()],
      holds: yield* deps.holds.listActive().pipe(Effect.orDie),
      lastSampledAt: deps.state.lastSampledAt,
    };
  });
