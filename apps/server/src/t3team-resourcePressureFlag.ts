/**
 * Runtime feature flag: the resource-pressure model (memory-pressure sampler,
 * persisted pressure events, `server.getResourcePressure`, the agent tool
 * `t3team.runtime.resource_pressure` and the diagnostics panel).
 *
 * The server advertises the flag to clients through `ServerConfig.resourcePressure`.
 *
 * Layering (owner flag rule): `NEXI_FF_RESOURCE_PRESSURE` env override >
 * code default. Default OFF: the sampler is a new background loop, so it is
 * opt-in until it has been observed on a real memory-pressure episode. With
 * the flag off no fiber is forked and no sample is ever taken.
 */

/** Environment override for the resource-pressure flag. `1`/`true`/`on` on, anything else off. */
export const RESOURCE_PRESSURE_FLAG_ENV = "NEXI_FF_RESOURCE_PRESSURE";

/** Optional sample-period override (ms), clamped to the bounded range below. */
export const RESOURCE_PRESSURE_INTERVAL_ENV = "T3TEAM_RESOURCE_PRESSURE_INTERVAL_MS";

export const RESOURCE_PRESSURE_DEFAULT_INTERVAL_MS = 20_000;
export const RESOURCE_PRESSURE_MIN_INTERVAL_MS = 10_000;
export const RESOURCE_PRESSURE_MAX_INTERVAL_MS = 120_000;

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isResourcePressureEnabled(readEnv: ReadEnv = processEnv): boolean {
  const raw = readEnv(RESOURCE_PRESSURE_FLAG_ENV)?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
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
