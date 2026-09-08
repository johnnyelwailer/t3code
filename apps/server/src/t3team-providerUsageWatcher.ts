/**
 * Provider usage-limit watcher (GHE #421, phase 2 — the watch + act layer).
 *
 * Phase 1 (the `t3team.runtime.provider_usage` tool) samples the live rolling
 * plan limits of a provider on demand. This module adds the WATCH side:
 *
 *  1. **Sweep** — every `T3TEAM_PROVIDER_USAGE_SWEEP_MS` (default 60 s) the
 *     watcher samples the live-limit windows of the providers that have an
 *     ACTIVE provider session right now (the #421 decision "session-scoped
 *     only — sample a provider only when it has an active session; no
 *     resident daemon"). With no active session, a sweep is a Set lookup and
 *     no network call.
 *  2. **Act** — when a driver's primary window turns `critical` against the
 *     host thresholds (window exhausted, e.g. Claude's 5-hour window at
 *     0% remaining), the watcher pauses every thread that would run on that
 *     driver: one hold row per affected session thread (auto-resume ON by
 *     default) plus one `provider.usage-hold.started` activity each. From
 *     then on the reactor's turn-start gate defers any turn start on a held
 *     thread instead of burning the provider's quota-error path — including
 *     the #403 bounded re-drive loop, which would otherwise fail the run in
 *     ~3 minutes while the window is closed for hours.
 *  3. **Auto-resume** — the hold rows carry the provider-reported `resetsAt`
 *     moment. The watcher re-checks on every sweep; when the window has
 *     recovered (a live sample reads below critical, or the deadline passed
 *     and no sample is available — the session-scoped rule means an idle
 *     machine may have nothing to sample) it releases the holds: threads
 *     with auto-resume ON get their pending turn re-driven through the
 *     existing `thread.turn.resume` command; threads with the toggle OFF are
 *     released without a replay so the user resumes deliberately. A host
 *     restart rehydrates the held set from the hold rows and an overdue
 *     deadline catches up immediately (the same downtime semantics as the
 *     workflow scheduler).
 *
 * The steps live in sibling modules split out for the additive LOC budget:
 * types/constants in `t3team-providerUsageWatcherTypes.ts`, act/release in
 * `t3team-providerUsageWatcherActions.ts`, the sweep pass in
 * `t3team-providerUsageWatcherSweep.ts`, the turn-start gate in
 * `t3team-providerUsageWatcherGate.ts`, and the dev hooks in
 * `t3team-providerUsageWatcherDevHooks.ts`. This module wires them into the
 * live layer.
 *
 * @module t3team-providerUsageWatcher
 */
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProviderUsageHoldRepository } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import { ProviderUsageHoldRepositoryLive } from "./persistence/Layers/t3team-ProviderUsageHolds.ts";
import * as ProviderService from "./provider/Services/ProviderService.ts";
import * as ServerSettingsModule from "./serverSettings.ts";
import { makeAppendActivity, rehydrateHeldSet } from "./t3team-providerUsageWatcherActions.ts";
import { forceExhaust, forceRecover, getDevState } from "./t3team-providerUsageWatcherDevHooks.ts";
import { checkThreadHeld, recordDeferredTurn } from "./t3team-providerUsageWatcherGate.ts";
import { sweepPass } from "./t3team-providerUsageWatcherSweep.ts";
import {
  PROVIDER_USAGE_SWEEP_INTERVAL_MS,
  ProviderUsageWatcher,
  type ProviderUsageWatcherDeps,
  type ProviderUsageWatcherShape,
  type ProviderUsageWatcherState,
} from "./t3team-providerUsageWatcherTypes.ts";

export * from "./t3team-providerUsageWatcherTypes.ts";

const makeProviderUsageWatcher = (input: {
  readonly sweepIntervalMs: number;
  readonly devForceEnabled: boolean;
}) =>
  Effect.gen(function* () {
    const settingsService = yield* ServerSettingsModule.ServerSettingsService;
    const providerService = yield* ProviderService.ProviderService;
    const engine = yield* OrchestrationEngineService;
    const holds = yield* ProviderUsageHoldRepository;
    const devForceEnabled = input.devForceEnabled;

    const state: ProviderUsageWatcherState = {
      heldDrivers: new Map(),
      warningDrivers: new Map(),
      lastSampledAt: null,
      sweepInFlight: false,
    };

    const nowIso = (): string => DateTime.formatIso(DateTime.nowUnsafe());
    const appendActivity = makeAppendActivity({ engine, nowIso });

    const deps: ProviderUsageWatcherDeps = {
      settingsService,
      providerService,
      engine,
      holds,
      devForceEnabled,
      state,
      nowIso,
      appendActivity,
    };

    // ── Rehydrate: rebuild the in-memory held set from the rows ────────────
    rehydrateHeldSet(state, yield* holds.listActive().pipe(Effect.orDie));

    // ── The sweep loop: first pass 5s after boot, then every interval ─────
    const loop = Effect.gen(function* () {
      yield* Effect.sleep(Duration.millis(5_000));
      while (true) {
        yield* sweepPass(deps).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider usage watcher sweep failed", {
              cause: Cause.pretty(cause),
            }),
          ),
        );
        yield* Effect.sleep(Duration.millis(input.sweepIntervalMs));
      }
    }).pipe(Effect.forkScoped);

    return {
      sweep: () => sweepPass(deps),
      checkThreadHeld: (input) => checkThreadHeld(deps, input),
      recordDeferredTurn: (input) => recordDeferredTurn(deps, input),
      forceExhaust: (input) => forceExhaust(deps, input),
      forceRecover: () => forceRecover(deps),
      getDevState: () => getDevState(deps),
    } satisfies ProviderUsageWatcherShape;
  });

const resolveSweepIntervalMs = (): number => {
  const raw = process.env["T3TEAM_PROVIDER_USAGE_SWEEP_MS"];
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 5_000) return parsed;
  }
  return PROVIDER_USAGE_SWEEP_INTERVAL_MS;
};

export const T3TeamProviderUsageWatcherLive = Layer.effect(
  ProviderUsageWatcher,
  makeProviderUsageWatcher({
    sweepIntervalMs: resolveSweepIntervalMs(),
    devForceEnabled:
      process.env["T3TEAM_PROVIDER_USAGE_DEV_FORCE"] === "1" ||
      process.env["T3TEAM_PROVIDER_USAGE_DEV_FORCE"] === "true",
  }),
).pipe(Layer.provideMerge(ProviderUsageHoldRepositoryLive));
