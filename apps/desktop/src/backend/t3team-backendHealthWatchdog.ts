/**
 * HTTP health watchdog for the desktop backend child (fork-owned).
 *
 * The manager already restarts the backend when the child process exits, but a
 * backend whose event loop is alive and whose HTTP stack stopped answering
 * (TCP accepts, requests never reply) never exits, so the app sat on
 * "reconnecting" forever (2026-10-13). Once the backend has been ready, this
 * watchdog probes the readiness URL on an interval; after N consecutive failed
 * or timed-out probes it reports the backend unhealthy so the caller can kill
 * the child (SIGTERM, then SIGKILL after the grace period). The child's exit
 * then goes through the manager's normal restart path with exponential backoff,
 * and the client reconnects as usual.
 *
 * Restart storms: each recent kill doubles the next warm-up; after
 * `maxKillsPerWindow` kills within `killWindow` it only logs.
 *
 * Busy is not dead: a backend whose event loop is blocked for seconds at a time
 * (a burst of process spawns, a large synchronous read) fails probes too. When
 * the failure threshold is reached the watchdog asks the backend's liveness
 * beacon (`t3team-backendLiveness.ts`). A busy backend gets `busyGrace` more to
 * recover; a frozen, wedged, or silent one is killed as before, and so is one
 * still busy when the grace runs out.
 */
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/http";

import {
  backendLivenessUnavailable,
  describeBackendLiveness,
  type BackendLiveness,
  type BackendLivenessVerdict,
} from "./t3team-backendLiveness.ts";
import type { BackendHealthWatchdogConfig } from "./t3team-backendHealthWatchdogConfig.ts";
import type { BackendWatchdogKillHistory } from "./t3team-backendWatchdogKillHistory.ts";

export {
  DEFAULT_BACKEND_HEALTH_WATCHDOG_CONFIG,
  resolveBackendHealthWatchdogConfig,
  type BackendHealthWatchdogConfig,
} from "./t3team-backendHealthWatchdogConfig.ts";
export { BackendWatchdogKillHistory } from "./t3team-backendWatchdogKillHistory.ts";

export class BackendHealthProbeError extends Schema.TaggedError<BackendHealthProbeError>()(
  "BackendHealthProbeError",
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

const isBackendHealthProbeError = Schema.is(BackendHealthProbeError);

export interface BackendProbeFailure {
  readonly consecutiveFailures: number;
  readonly lastFailure: string;
}

export interface BackendUnhealthy extends BackendProbeFailure {
  readonly verdict: BackendLivenessVerdict;
  readonly failingForMs: number;
}

const probeOnce = <R>(
  probe: Effect.Effect<void, BackendHealthProbeError, R>,
  timeout: Duration.Duration,
): Effect.Effect<Option.Option<string>, never, R> =>
  probe.pipe(
    Effect.timeoutOption(timeout),
    Effect.map(
      Option.match({
        onNone: () => Option.some(`no reply within ${Duration.toMillis(timeout)}ms`),
        onSome: () => Option.none<string>(),
      }),
    ),
    Effect.catchCause((cause) =>
      Effect.succeedSome(Cause.pretty(cause).split("\n")[0] ?? "probe failed"),
    ),
  );

/**
 * Probes until `failureThreshold` consecutive probes fail and the backend is
 * not merely busy within `busyGrace`, then returns the failure summary. A
 * successful probe resets the counter. Never fails.
 */
export const watchBackendHealth = <R>(options: {
  readonly config: BackendHealthWatchdogConfig;
  readonly probe: Effect.Effect<void, BackendHealthProbeError, R>;
  readonly liveness?: BackendLiveness;
  readonly onProbeFailure?: (info: BackendProbeFailure) => Effect.Effect<void>;
  readonly onBusy?: (info: BackendUnhealthy) => Effect.Effect<void>;
}): Effect.Effect<BackendUnhealthy, never, R> =>
  Effect.gen(function* () {
    const { config } = options;
    const liveness = options.liveness ?? backendLivenessUnavailable;
    let failures = 0;
    let failingSinceMs: number | undefined;
    let waitingOnBusy = false;
    while (true) {
      const failure = yield* probeOnce(options.probe, config.probeTimeout);
      if (Option.isNone(failure)) {
        failures = 0;
        failingSinceMs = undefined;
        waitingOnBusy = false;
      } else {
        failures += 1;
        const nowMs = yield* Clock.currentTimeMillis;
        failingSinceMs ??= nowMs;
        const info = { consecutiveFailures: failures, lastFailure: failure.value };
        yield* options.onProbeFailure?.(info) ?? Effect.void;
        if (failures >= config.failureThreshold) {
          const unhealthy = {
            ...info,
            verdict: yield* liveness.assess,
            failingForMs: nowMs - failingSinceMs,
          };
          const withinBusyGrace =
            unhealthy.verdict.kind === "busy" &&
            unhealthy.failingForMs < Duration.toMillis(config.busyGrace);
          if (!withinBusyGrace) return unhealthy;
          if (!waitingOnBusy) yield* options.onBusy?.(unhealthy) ?? Effect.void;
          waitingOnBusy = true;
        }
      }
      yield* Effect.sleep(config.interval);
    }
  });

/** GET `path` on the backend; any 2xx counts as healthy. */
export const makeBackendHttpHealthProbe = (
  httpBaseUrl: URL,
  path: string,
): Effect.Effect<void, BackendHealthProbeError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(
      HttpClientRequest.get(new URL(path, httpBaseUrl).toString()),
    );
    if (response.status < 200 || response.status >= 300) {
      return yield* new BackendHealthProbeError({
        reason: `health probe returned HTTP ${response.status}`,
      });
    }
  }).pipe(
    Effect.scoped,
    Effect.mapError((error) =>
      isBackendHealthProbeError(error)
        ? error
        : new BackendHealthProbeError({ reason: error.message }),
    ),
  );

const describeUnhealthy = ({ verdict, ...rest }: BackendUnhealthy) => ({
  ...rest,
  liveness: verdict.kind,
  livenessDetail: describeBackendLiveness(verdict),
});

/**
 * Full watchdog cycle for one ready backend run: warm-up, watch, then either
 * kill (via `kill`) or, when the kill budget is spent, only log and stop.
 */
export const runBackendHealthWatchdog = <R>(options: {
  readonly config: BackendHealthWatchdogConfig;
  readonly history: BackendWatchdogKillHistory;
  readonly probe: Effect.Effect<void, BackendHealthProbeError, R>;
  readonly liveness?: BackendLiveness;
  readonly kill: Effect.Effect<void>;
  readonly log: (message: string, details: Record<string, unknown>) => Effect.Effect<void>;
}): Effect.Effect<void, never, R> =>
  Effect.gen(function* () {
    const { config, history } = options;
    if (!config.enabled) return;
    yield* Effect.sleep(history.warmupFor(config));
    const unhealthy = yield* watchBackendHealth({
      config,
      probe: options.probe,
      ...(options.liveness ? { liveness: options.liveness } : {}),
      onBusy: (busy) =>
        options.log("backend not answering but busy; waiting before killing it", {
          ...describeUnhealthy(busy),
          busyGraceMs: Duration.toMillis(config.busyGrace),
        }),
    });
    const details = { ...describeUnhealthy(unhealthy), recentKills: history.recentKills(config) };
    if (!history.mayKill(config)) {
      yield* options.log(
        "backend unresponsive; watchdog restart budget spent, not killing",
        details,
      );
      return;
    }
    history.recordKill();
    yield* options.log(
      unhealthy.verdict.kind === "busy"
        ? "backend stayed busy past the watchdog's grace; killing it so it restarts"
        : "backend unresponsive; killing it so it restarts",
      { ...details, recentKills: history.recentKills(config) },
    );
    yield* options.kill;
  });
