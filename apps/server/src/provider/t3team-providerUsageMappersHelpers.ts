/**
 * Shared percent helpers for the provider usage-limit mappers (split out of
 * `t3team-providerUsageMappers.ts`): finite-percent guards and clamping,
 * used by both the Claude OAuth and the Codex mappers.
 *
 * @module t3team-providerUsageMappersHelpers
 */

export const isFinitePercent = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
