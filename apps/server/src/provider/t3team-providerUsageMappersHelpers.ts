/**
 * Shared percent helpers for the provider usage-limit mappers (split out of
 * `t3team-providerUsageMappers.ts`): finite-percent guards, clamping and
 * the expired-window rule, used by both the Claude OAuth and the Codex
 * mappers.
 *
 * @module t3team-providerUsageMappersHelpers
 */

export const isFinitePercent = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/**
 * A rolling window that is still counting always resets in the future. A
 * reported `resetsAt` at or before the sample moment means the provider
 * handed back a window that has already rolled over (a stale snapshot, or
 * an endpoint that has not re-rolled yet): its percent says nothing about
 * the live window and must not be reported. `null`/unparsable stays live.
 */
export const isExpiredWindow = (resetsAtIso: string | null, sampledAtIso: string): boolean => {
  if (resetsAtIso === null) return false;
  const resetsAtMs = Date.parse(resetsAtIso);
  const sampledAtMs = Date.parse(sampledAtIso);
  return Number.isFinite(resetsAtMs) && Number.isFinite(sampledAtMs) && resetsAtMs <= sampledAtMs;
};
