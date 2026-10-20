/**
 * Tuning for the desktop backend health watchdog (`t3team-backendHealthWatchdog.ts`).
 */
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";

export interface BackendHealthWatchdogConfig {
  readonly enabled: boolean;
  readonly interval: Duration.Duration;
  readonly probeTimeout: Duration.Duration;
  readonly failureThreshold: number;
  readonly warmup: Duration.Duration;
  readonly maxKillsPerWindow: number;
  readonly killWindow: Duration.Duration;
  /**
   * How long probes may keep failing while the backend's liveness beacon shows its event loop
   * is busy (blocked for seconds at a time) before it is killed anyway.
   */
  readonly busyGrace: Duration.Duration;
}

// 5 failures x (3s timeout + 3s spacing) ≈ 30s before a kill; a busy backend gets 2 minutes.
export const DEFAULT_BACKEND_HEALTH_WATCHDOG_CONFIG: BackendHealthWatchdogConfig = {
  enabled: true,
  interval: Duration.seconds(3),
  probeTimeout: Duration.seconds(3),
  failureThreshold: 5,
  warmup: Duration.seconds(10),
  maxKillsPerWindow: 3,
  killWindow: Duration.minutes(15),
  busyGrace: Duration.minutes(2),
};

const readPositiveInt = (value: string | undefined): Option.Option<number> => {
  if (value === undefined || value.trim() === "") return Option.none();
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Option.some(parsed) : Option.none();
};

/**
 * Env overrides: T3TEAM_BACKEND_WATCHDOG=0 disables it;
 * T3TEAM_BACKEND_WATCHDOG_INTERVAL_MS, _TIMEOUT_MS, _FAILURES, _BUSY_GRACE_MS tune it.
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
    busyGrace: ms("T3TEAM_BACKEND_WATCHDOG_BUSY_GRACE_MS", base.busyGrace),
  };
}
