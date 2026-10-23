/**
 * Runtime feature flag: the resource-pressure model (memory-pressure sampler,
 * persisted pressure events, `server.getResourcePressure`, the pressure line on
 * pressure-impacting tool results, the turn notes, auto-pause at the turn
 * boundary, per-thread cleanup and the diagnostics panel).
 *
 * The server advertises the flag to clients through `ServerConfig.featureFlags` and, for older
 * clients, `ServerConfig.resourcePressure`.
 *
 * Layering: `NEXI_FF_RESOURCE_PRESSURE` env override > feature_flags user value > release
 * preset > code default (off). Default OFF: the sampler is a new background loop, so it is
 * opt-in until it has been observed on a real memory-pressure episode. With the flag off no
 * fiber is forked and no sample is ever taken. The monitor reads it once at layer build
 * (`requiresRestart`), after the feature flag service has loaded the user values.
 */

import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

/** Optional sample-period override (ms), clamped to the bounded range below. */
const RESOURCE_PRESSURE_INTERVAL_ENV = "T3TEAM_RESOURCE_PRESSURE_INTERVAL_MS";

const RESOURCE_PRESSURE_DEFAULT_INTERVAL_MS = 20_000;
const RESOURCE_PRESSURE_MIN_INTERVAL_MS = 10_000;
const RESOURCE_PRESSURE_MAX_INTERVAL_MS = 120_000;

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isResourcePressureEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("RESOURCE_PRESSURE", readEnv);
}

/** Sample period: env override clamped to [10 s, 120 s]; malformed values fall back to 20 s. */
export function resolveResourcePressureIntervalMs(readEnv: ReadEnv = processEnv): number {
  const raw = readEnv(RESOURCE_PRESSURE_INTERVAL_ENV);
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) return RESOURCE_PRESSURE_DEFAULT_INTERVAL_MS;
  return Math.min(
    RESOURCE_PRESSURE_MAX_INTERVAL_MS,
    Math.max(RESOURCE_PRESSURE_MIN_INTERVAL_MS, Math.round(parsed)),
  );
}
