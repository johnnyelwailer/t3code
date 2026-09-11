/**
 * Provider usage-limit sampling — Anthropic OAuth wire→contract mapper
 * (split out of `t3team-providerUsageMappers.ts`).
 *
 * Claude's OAuth usage endpoint pre-digests a `limits[]` array with its own
 * `severity`; the host thresholds decide severity as a fallback.
 *
 * @module t3team-providerUsageMappersClaude
 */
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderUsageReport,
  ProviderUsageSample,
  ProviderUsageSeverity,
  ProviderUsageWindowKind,
} from "@t3tools/contracts";

import {
  DEFAULT_PROVIDER_USAGE_THRESHOLDS,
  severityForPercent,
  type ProviderUsageThresholds,
} from "./t3team-providerUsageSampler.ts";

import { clampPercent, isFinitePercent } from "./t3team-providerUsageMappersHelpers.ts";

/** Source labels reported in `ProviderUsageSample.source`. */
export const CLAUDE_USAGE_SOURCE = "anthropic-oauth-usage";

/** One rolling window as Anthropic's OAuth usage endpoint reports it. */
export interface ClaudeUsageWindowBody {
  readonly utilization?: number | null;
  readonly resets_at?: string | null;
  readonly [key: string]: unknown;
}

/** One entry of the pre-digested `limits[]` array. */
export interface ClaudeUsageLimitBody {
  readonly kind?: string;
  readonly percent?: number | null;
  readonly severity?: "normal" | "warning" | "critical";
  readonly resets_at?: string | null;
  readonly [key: string]: unknown;
}

export interface ClaudeUsageBody {
  readonly five_hour?: ClaudeUsageWindowBody | null;
  readonly seven_day?: ClaudeUsageWindowBody | null;
  readonly limits?: ReadonlyArray<ClaudeUsageLimitBody | null> | null;
  readonly [key: string]: unknown;
}

const claudeLimitsForWindow = (
  limits: ClaudeUsageBody["limits"],
  kind: string,
): ClaudeUsageLimitBody | undefined =>
  limits
    ?.filter((entry): entry is ClaudeUsageLimitBody => entry !== null)
    .find((entry) => entry.kind === kind);

/**
 * Maps Anthropic's OAuth usage body onto a `ProviderUsageReport`.
 *
 * Severity prefers the API's own pre-digested verdict (`limits[]`,
 * `session` → primary, `weekly_all` → secondary) and falls back to the host
 * thresholds on `utilization` when the entry is missing.
 */
export const mapClaudeUsage = (
  body: ClaudeUsageBody,
  input: {
    readonly provider: ProviderDriverKind;
    readonly providerInstanceId?: ProviderInstanceId;
    readonly plan?: string;
    readonly thresholds?: ProviderUsageThresholds;
    readonly sampledAt: string;
  },
): ProviderUsageReport => {
  const thresholds = input.thresholds ?? DEFAULT_PROVIDER_USAGE_THRESHOLDS;
  const windows: ProviderUsageSample[] = [];
  const mapWindow = (
    source: ClaudeUsageWindowBody | null | undefined,
    limitKind: string,
    window: ProviderUsageWindowKind,
  ) => {
    if (!source || !isFinitePercent(source.utilization)) return;
    const percentUsed = clampPercent(source.utilization);
    const limit = claudeLimitsForWindow(body.limits, limitKind);
    const severity: ProviderUsageSeverity =
      limit?.severity ??
      severityForPercent(
        isFinitePercent(limit?.percent) ? (limit?.percent as number) : percentUsed,
        thresholds,
      );
    windows.push({
      provider: input.provider,
      window,
      percentUsed,
      resetsAt: source.resets_at ?? null,
      severity,
      source: CLAUDE_USAGE_SOURCE,
      sampledAt: input.sampledAt,
    });
  };
  mapWindow(body.five_hour, "session", "primary");
  mapWindow(body.seven_day, "weekly_all", "secondary");
  const plan = input.plan;
  return {
    provider: input.provider,
    ...(input.providerInstanceId !== undefined
      ? { providerInstanceId: input.providerInstanceId }
      : {}),
    ...(plan !== undefined ? { plan } : {}),
    windows,
  };
};
