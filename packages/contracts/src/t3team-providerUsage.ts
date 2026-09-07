/**
 * Provider usage-limit contract.
 *
 * Complements {@link UsageSummary} (`usage.ts`): that contract tracks
 * CONSUMPTION aggregated from provider transcript files. This one tracks
 * PLAN LIMITS — the rolling rate-limit windows the provider itself reports
 * (Anthropic's OAuth usage API for Claude, the Codex app-server's
 * `account/rateLimits/read` for Codex). The two are different sources of
 * truth and must not be mixed: consumption is historical, limits are live.
 *
 * A sample is always about one rolling window of one provider instance:
 *
 * - `window: "primary"` is the provider's short rolling window (5 hours for
 *   Claude and Codex today), `"secondary"` the longer one (7 days).
 * - `percentUsed` is how much of the window was consumed (0..100).
 * - `severity` is the host's verdict on that percentage against the
 *   configured thresholds, so clients never re-derive it themselves.
 *
 * @module providerUsage
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

/**
 * Bumped whenever the shape of {@link ProviderUsageSample} /
 * {@link ProviderUsageReport} changes incompatibly. Consumers that understand
 * an older version should render the reports they can and drop the rest,
 * mirroring `USAGE_MERGE_COMPATIBLE_SINCE` in `usage.ts`.
 */
export const PROVIDER_USAGE_CONTRACT_VERSION = 1 as const;

export const ProviderUsageWindowKind = Schema.Literals(["primary", "secondary"]);
export type ProviderUsageWindowKind = typeof ProviderUsageWindowKind.Type;

/**
 * The host's verdict on how close a window is to exhaustion, derived from the
 * configured warning/critical thresholds. Providers that pre-digest severity
 * (Claude's `limits[]`) report it directly; the rest is computed from
 * `percentUsed`.
 */
export const ProviderUsageSeverity = Schema.Literals(["normal", "warning", "critical"]);
export type ProviderUsageSeverity = typeof ProviderUsageSeverity.Type;

export const ProviderUsagePercentUsed = Schema.Number.check(
  Schema.isFinite(),
  Schema.isBetween({ minimum: 0, maximum: 100 }),
);
export type ProviderUsagePercentUsed = typeof ProviderUsagePercentUsed.Type;

/**
 * One rolling usage window of one provider instance, sampled at one instant.
 *
 * `provider` is the DRIVER KIND (`claudeAgent`, `codex`, …) that produced the
 * sample, not the instance routing key: limits live at the account level, and
 * two instances of the same driver on one machine share the same account
 * windows. The report-level `providerInstanceId` names which configured
 * instance sampled it, when known.
 */
export const ProviderUsageSample = Schema.Struct({
  provider: ProviderDriverKind,
  window: ProviderUsageWindowKind,
  percentUsed: ProviderUsagePercentUsed,
  /** Epoch moment the window resets; null when the provider does not report one. */
  resetsAt: Schema.NullOr(IsoDateTime),
  severity: ProviderUsageSeverity,
  /**
   * Where the number came from, e.g. `anthropic-oauth-usage` or
   * `codex-app-server:account/rateLimits/read`. Human-debug context only —
   * clients must not branch on it.
   */
  source: TrimmedNonEmptyString,
  sampledAt: IsoDateTime,
});
export type ProviderUsageSample = typeof ProviderUsageSample.Type;

/**
 * Per-provider summary: every window the sampler knows about for one driver
 * kind at one sampling instant.
 */
export const ProviderUsageReport = Schema.Struct({
  provider: ProviderDriverKind,
  providerInstanceId: Schema.optional(ProviderInstanceId),
  /** Provider-reported plan tier, when the source carries one (e.g. Codex `planType`). */
  plan: Schema.optional(TrimmedNonEmptyString),
  windows: Schema.Array(ProviderUsageSample),
});
export type ProviderUsageReport = typeof ProviderUsageReport.Type;

/**
 * One requested instance that could not be sampled. Kept separate from the
 * reports so a single unavailable provider never degrades the others.
 */
export const ProviderUsageUnavailable = Schema.Struct({
  provider: ProviderDriverKind,
  providerInstanceId: Schema.optional(ProviderInstanceId),
  reason: TrimmedNonEmptyString,
});
export type ProviderUsageUnavailable = typeof ProviderUsageUnavailable.Type;

/**
 * The full answer to one `t3team.runtime.provider_usage` call: one report per
 * driver kind sampled, plus the instances that could not be sampled.
 */
export const ProviderUsageQueryResult = Schema.Struct({
  contractVersion: Schema.Literal(PROVIDER_USAGE_CONTRACT_VERSION),
  reports: Schema.Array(ProviderUsageReport),
  unavailable: Schema.Array(ProviderUsageUnavailable),
});
export type ProviderUsageQueryResult = typeof ProviderUsageQueryResult.Type;
