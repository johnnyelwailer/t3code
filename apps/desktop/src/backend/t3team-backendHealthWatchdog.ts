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
 */
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/http";

export interface BackendHealthWatchdogConfig {
  readonly enabled: boolean;
  readonly interval: Duration.Duration;
  readonly probeTimeout: Duration.Duration;
  readonly failureThreshold: number;
  readonly warmup: Duration.Duration;
  readonly maxKillsPerWindow: number;
  readonly killWindow: Duration.Duration;
}

// 5 failures x (3s timeout + 3s spacing) ≈ 30s before a kill.
export const DEFAULT_BACKEND_HEALTH_WATCHDOG_CONFIG: BackendHealthWatchdogConfig = {
  enabled: true,
  interval: Duration.seconds(3),
  probeTimeout: Duration.seconds(3),
  failureThreshold: 5,
  warmup: Duration.seconds(10),
  maxKillsPerWindow: 3,
  killWindow: Duration.minutes(15),
};

const readPositiveInt = (value: string | undefined): Option.Option<number> => {
  if (value === undefined || value.trim() === "") return Option.none();
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Option.some(parsed) : Option.none();
};

/**
 * Env overrides: T3TEAM_BACKEND_WATCHDOG=0 disables it;
 * T3TEAM_BACKEND_WATCHDOG_INTERVAL_MS, _TIMEOUT_MS, _FAILURES tune it.
 */
export function resolveBackendHealthWatchdogConfig(
  env: Readonly<Record<string, string | undefined>>,
  base: BackendHealthWatchdogConfig = DEFAULT_BACKEND_HEALTH_WATCHDOG_CONFIG,
): BackendHealthWatchdogConfig {
  const ms = (key: string, fallback: Duration.Duration) =>
    Option.match(readPositiveInt(env[key]), {
      onNone: () => fallback,
      onSome: (value) => Duration.millis(value),
    });
  return {
    ...base,
    enabled: env.T3TEAM_BACKEND_WATCHDOG !== "0" && base.enabled,
    interval: ms("T3TEAM_BACKEND_WATCHDOG_INTERVAL_MS", base.interval),
    probeTimeout: ms("T3TEAM_BACKEND_WATCHDOG_TIMEOUT_MS", base.probeTimeout),
    failureThreshold: Option.getOrElse(
      readPositiveInt(env.T3TEAM_BACKEND_WATCHDOG_FAILURES),
      () => base.failureThreshold,
    ),
  };
}

export class BackendHealthProbeError extends Schema.TaggedError<BackendHealthProbeError>()(
  "BackendHealthProbeError",
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

const isBackendHealthProbeError = Schema.is(BackendHealthProbeError);

export interface BackendUnhealthy {
  readonly consecutiveFailures: number;
  readonly lastFailure: string;
}

/** Tracks watchdog kills across runs of one backend instance. */
export class BackendWatchdogKillHistory {
  private kills: Array<number> = [];
  private readonly now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private prune(config: BackendHealthWatchdogConfig): void {
    const cutoff = this.now() - Duration.toMillis(config.killWindow);
    this.kills = this.kills.filter((at) => at >= cutoff);
  }
  recordKill(): void {
    this.kills.push(this.now());
  }
  recentKills(config: BackendHealthWatchdogConfig): number {
    this.prune(config);
    return this.kills.length;
  }
  /** Warm-up doubles with every recent kill, capped at the kill window. */
  warmupFor(config: BackendHealthWatchdogConfig): Duration.Duration {
    const factor = 2 ** this.recentKills(config);
    return Duration.min(Duration.times(config.warmup, factor), config.killWindow);
  }
  mayKill(config: BackendHealthWatchdogConfig): boolean {
    return this.recentKills(config) < config.maxKillsPerWindow;
  }
}

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : typeof cause === "string" ? cause : String(cause);

/**
 * Probes until `failureThreshold` consecutive probes fail, then returns the
 * failure summary. A successful probe resets the counter. Never fails.
 */
export const watchBackendHealth = <R>(options: {
  readonly config: BackendHealthWatchdogConfig;
  readonly probe: Effect.Effect<void, BackendHealthProbeError, R>;
  readonly onProbeFailure?: (info: BackendUnhealthy) => Effect.Effect<void>;
}): Effect.Effect<BackendUnhealthy, never, R> =>
  Effect.gen(function* () {
    const { config } = options;
    let failures = 0;
    while (true) {
      const result = yield* options.probe.pipe(
        Effect.timeoutOption(config.probeTimeout),
        Effect.map(
          Option.match({
            onNone: () =>
              Option.some(`no reply within ${Duration.toMillis(config.probeTimeout)}ms`),
            onSome: () => Option.none<string>(),
          }),
        ),
        Effect.catchCause((cause) => Effect.succeedSome(describe(Cause.squash(cause)))),
      );
      if (Option.isNone(result)) {
        failures = 0;
      } else {
        failures += 1;
        const info = { consecutiveFailures: failures, lastFailure: result.value };
        yield* options.onProbeFailure?.(info) ?? Effect.void;
        if (failures >= config.failureThreshold) return info;
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

/**
 * Full watchdog cycle for one ready backend run: warm-up, watch, then either
 * kill (via `kill`) or, when the kill budget is spent, only log and stop.
 */
export const runBackendHealthWatchdog = <R>(options: {
  readonly config: BackendHealthWatchdogConfig;
  readonly history: BackendWatchdogKillHistory;
  readonly probe: Effect.Effect<void, BackendHealthProbeError, R>;
  readonly kill: Effect.Effect<void>;
  readonly log: (message: string, details: Record<string, unknown>) => Effect.Effect<void>;
}): Effect.Effect<void, never, R> =>
  Effect.gen(function* () {
    const { config, history } = options;
    if (!config.enabled) return;
    yield* Effect.sleep(history.warmupFor(config));
    const unhealthy = yield* watchBackendHealth({ config, probe: options.probe });
    if (!history.mayKill(config)) {
      yield* options.log("backend unresponsive; watchdog restart budget spent, not killing", {
        ...unhealthy,
        recentKills: history.recentKills(config),
      });
      return;
    }
    history.recordKill();
    yield* options.log("backend unresponsive; killing it so it restarts", {
      ...unhealthy,
      recentKills: history.recentKills(config),
    });
    yield* options.kill;
  });
