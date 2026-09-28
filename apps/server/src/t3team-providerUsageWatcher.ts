/**
 * Provider usage watcher (GHE #421) — the fork's consumer of upstream's ONE
 * provider-usage pipeline.
 *
 * Data: every provider instance publishes `ServerProvider.usageLimits`
 * (periodic probe + live `account.rate-limits.updated` merges); this layer
 * subscribes to `ProviderRegistry.streamChanges` and never samples anything
 * itself. Owner rules it enforces:
 *
 *  1. An explicit user send is NEVER blocked — the provider decides.
 *  2. A turn that actually hits the limit (the adapter's structured
 *     `failureKind: "usage_limit"`, or a failure while the instance's window
 *     is exhausted) is recorded as pending and replayed ONCE after the
 *     window's `resetsAt` + grace, or earlier when a fresh snapshot shows the
 *     instance recovered (`t3team-providerUsageWatcherFailures.ts`,
 *     `t3team-providerUsageWatcherActions.ts`).
 *  3. Holds and warnings are keyed by provider INSTANCE (account), never by
 *     driver (`t3team-providerUsageWatcherLimits.ts`).
 *
 * All steps run under one permit so a deadline tick, a snapshot and a turn
 * outcome never interleave; the conditional release in the repository is the
 * second line of defence against a double replay.
 *
 * @module t3team-providerUsageWatcher
 */
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderUsageHoldRepository } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import { ProviderUsageHoldRepositoryLive } from "./persistence/Layers/t3team-ProviderUsageHolds.ts";
import { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import { makeAppendActivity } from "./t3team-providerUsageWatcherActions.ts";
import { releaseDue } from "./t3team-providerUsageWatcherDeadline.ts";
import { forceExhaust, forceRecover, getDevState } from "./t3team-providerUsageWatcherDevHooks.ts";
import { onRuntimeEvent } from "./t3team-providerUsageWatcherFailures.ts";
import { applyProviders } from "./t3team-providerUsageWatcherLimits.ts";
import {
  PROVIDER_USAGE_DEADLINE_CHECK_MS,
  ProviderUsageWatcher,
  type ProviderUsageWatcherDeps,
  type ProviderUsageWatcherShape,
} from "./t3team-providerUsageWatcherTypes.ts";

export * from "./t3team-providerUsageWatcherTypes.ts";

/** A failing step is logged and swallowed: the watcher must never stop, nor fail a caller. */
const guarded = <A>(label: string, effect: Effect.Effect<A>) =>
  effect.pipe(
    Effect.asVoid,
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterruptsOnly(cause),
      (cause) =>
        Effect.logWarning(`provider usage watcher: ${label} failed`, {
          cause: Cause.pretty(cause),
        }),
    ),
  );

/** Build the watcher over explicit services (the layer and the tests share this). */
export const makeProviderUsageWatcher = Effect.fn("makeProviderUsageWatcher")(function* (input: {
  readonly engine: ProviderUsageWatcherDeps["engine"];
  readonly query: ProviderUsageWatcherDeps["query"];
  readonly holds: ProviderUsageWatcherDeps["holds"];
  readonly devForceEnabled: boolean;
}) {
  const lock = yield* Semaphore.make(1);
  const serial = lock.withPermits(1);
  const deps: ProviderUsageWatcherDeps = {
    engine: input.engine,
    query: input.query,
    holds: input.holds,
    state: { instances: new Map(), heldThreads: new Map(), replayFailures: new Map() },
    appendActivity: makeAppendActivity(input.engine),
  };
  for (const row of yield* input.holds.listActive().pipe(Effect.orDie)) {
    deps.state.heldThreads.set(row.threadId, {
      instanceId: row.providerInstanceId,
      since: row.since,
      resetsAt: row.resetsAt,
    });
  }
  return {
    applyProviders: (providers) => guarded("snapshot", serial(applyProviders(deps, providers))),
    onRuntimeEvent: (event) => guarded("turn outcome", serial(onRuntimeEvent(deps, event))),
    releaseDue: () => guarded("deadline check", serial(releaseDue(deps))),
    forceExhaust: (devInput) => serial(forceExhaust(deps, input.devForceEnabled, devInput)),
    forceRecover: () => serial(forceRecover(deps, input.devForceEnabled)),
    getDevState: () => getDevState(deps),
  } satisfies ProviderUsageWatcherShape;
});

const makeLive = Effect.gen(function* () {
  const providerRegistry = yield* ProviderRegistry;
  const providerService = yield* ProviderService;
  const watcher = yield* makeProviderUsageWatcher({
    engine: yield* OrchestrationEngineService,
    query: yield* ProjectionSnapshotQuery,
    holds: yield* ProviderUsageHoldRepository,
    devForceEnabled:
      process.env["T3TEAM_PROVIDER_USAGE_DEV_FORCE"] === "1" ||
      process.env["T3TEAM_PROVIDER_USAGE_DEV_FORCE"] === "true",
  });
  // Current state first, then every aggregated change.
  yield* Stream.concat(
    Stream.fromEffect(providerRegistry.getProviders),
    providerRegistry.streamChanges,
  ).pipe(Stream.runForEach(watcher.applyProviders), Effect.forkScoped);
  yield* Stream.runForEach(providerService.streamEvents, watcher.onRuntimeEvent).pipe(
    Effect.forkScoped,
  );
  // The first check runs at boot, so a reset that passed while the host was
  // down is honoured immediately.
  yield* watcher
    .releaseDue()
    .pipe(
      Effect.repeat(Schedule.spaced(Duration.millis(PROVIDER_USAGE_DEADLINE_CHECK_MS))),
      Effect.forkScoped,
    );
  return watcher;
});

export const T3TeamProviderUsageWatcherLive = Layer.effect(ProviderUsageWatcher, makeLive).pipe(
  Layer.provideMerge(ProviderUsageHoldRepositoryLive),
);
