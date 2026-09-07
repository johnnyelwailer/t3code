/**
 * Provider usage-limit sampling — pure wire→contract mappers.
 *
 * Claude's OAuth usage endpoint pre-digests a `limits[]` array with its own
 * `severity`; Codex's `account/rateLimits/read` reports bare percentages, so
 * the host thresholds decide severity there.
 *
 * @module t3team-providerUsageMappers
 */
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderUsageReport,
  ProviderUsageSample,
  ProviderUsageSeverity,
  ProviderUsageWindowKind,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  DEFAULT_PROVIDER_USAGE_THRESHOLDS,
  severityForPercent,
  type ProviderUsageThresholds,
} from "./t3team-providerUsageSampler.ts";

/** Source labels reported in `ProviderUsageSample.source`. */
export const CLAUDE_USAGE_SOURCE = "anthropic-oauth-usage";
export const CODX_USAGE_SOURCE = "codex-app-server:account/rateLimits/read";

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

/** `primary`/`secondary` windows as `account/rateLimits/read` reports them. */
export interface CodexRateLimitWindowBody {
  readonly usedPercent?: number | null;
  readonly resetsAt?: number | null;
  readonly windowDurationMins?: number | null;
}

export interface CodexRateLimitsSnapshot {
  readonly primary?: CodexRateLimitWindowBody | null;
  readonly secondary?: CodexRateLimitWindowBody | null;
  readonly planType?: string | null;
  readonly [key: string]: unknown;
}

export interface CodexRateLimitsBody {
  readonly rateLimits?: CodexRateLimitsSnapshot | null;
}

/** Source label for header-based sampling (vs. the app-server JSON-RPC). */
export const CODEX_HEADERS_USAGE_SOURCE = "gateway-response-headers";

/**
 * Maps rate-limit headers from a gateway model response onto a
 * `ProviderUsageReport`. Handles common OpenAI-compatible patterns:
 * - `x-ratelimit-remaining-requests` / `x-ratelimit-limit-requests`
 * - `x-ratelimit-reset-requests` (epoch seconds or ISO)
 * - `x-ratelimit-remaining-tokens` / `x-ratelimit-limit-tokens`
 * - `x-ratelimit-reset-tokens`
 *
 * Returns `null` when no recognizable rate-limit data is present.
 */
export const mapCodexRateLimitHeaders = (
  headers: Record<string, string>,
  input: {
    readonly provider: ProviderDriverKind;
    readonly providerInstanceId?: ProviderInstanceId;
    readonly thresholds?: ProviderUsageThresholds;
    readonly sampledAt: string;
  },
): ProviderUsageReport | null => {
  const thresholds = input.thresholds ?? DEFAULT_PROVIDER_USAGE_THRESHOLDS;
  const primary = extractWindowFromHeaders(headers, "requests");
  const secondary = extractWindowFromHeaders(headers, "tokens");
  if (primary === null && secondary === null) return null;
  const windows: ProviderUsageSample[] = [];
  if (primary !== null) {
    windows.push({
      provider: input.provider,
      window: "primary",
      percentUsed: primary.percentUsed,
      resetsAt: primary.resetsAt,
      severity: severityForPercent(primary.percentUsed, thresholds),
      source: CODEX_HEADERS_USAGE_SOURCE,
      sampledAt: input.sampledAt,
    });
  }
  if (secondary !== null) {
    windows.push({
      provider: input.provider,
      window: "secondary",
      percentUsed: secondary.percentUsed,
      resetsAt: secondary.resetsAt,
      severity: severityForPercent(secondary.percentUsed, thresholds),
      source: CODEX_HEADERS_USAGE_SOURCE,
      sampledAt: input.sampledAt,
    });
  }
  return {
    provider: input.provider,
    ...(input.providerInstanceId !== undefined
      ? { providerInstanceId: input.providerInstanceId }
      : {}),
    windows,
  };
};

type HeaderWindow = {
  readonly percentUsed: number;
  readonly resetsAt: string | null;
};

const extractWindowFromHeaders = (
  headers: Record<string, string>,
  suffix: string,
): HeaderWindow | null => {
  const limitKey = `x-ratelimit-limit-${suffix}`;
  const remainingKey = `x-ratelimit-remaining-${suffix}`;
  const resetKey = `x-ratelimit-reset-${suffix}`;
  const limitRaw = headers[limitKey];
  const remainingRaw = headers[remainingKey];
  if (limitRaw === undefined || remainingRaw === undefined) return null;
  const limit = Number(limitRaw);
  const remaining = Number(remainingRaw);
  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || limit <= 0) {
    return null;
  }
  const percentUsed = clampPercent(((limit - remaining) / limit) * 100);
  let resetsAt: string | null = null;
  const resetRaw = headers[resetKey];
  if (resetRaw !== undefined) {
    const asNumber = Number(resetRaw);
    if (Number.isFinite(asNumber) && asNumber > 1_000_000_000) {
      resetsAt = DateTime.formatIso(DateTime.fromEpochSeconds(asNumber));
    } else {
      const parsed = Date.parse(resetRaw);
      if (!Number.isNaN(parsed)) {
        resetsAt = DateTime.formatIso(DateTime.fromEpochSeconds(Math.floor(parsed / 1000)));
      }
    }
  }
  return { percentUsed, resetsAt };
};

const isFinitePercent = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

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

/**
 * Maps the Codex app-server `account/rateLimits/read` response onto a
 * `ProviderUsageReport`. Codex reports no severity, so the host thresholds
 * apply to `usedPercent`. `resetsAt` arrives as epoch seconds.
 */
export const mapCodexRateLimits = (
  body: CodexRateLimitsBody,
  input: {
    readonly provider: ProviderDriverKind;
    readonly providerInstanceId?: ProviderInstanceId;
    readonly thresholds?: ProviderUsageThresholds;
    readonly sampledAt: string;
  },
): ProviderUsageReport => {
  const thresholds = input.thresholds ?? DEFAULT_PROVIDER_USAGE_THRESHOLDS;
  const rateLimits = body.rateLimits;
  const windows: ProviderUsageSample[] = [];
  const mapWindow = (
    source: CodexRateLimitWindowBody | null | undefined,
    window: ProviderUsageWindowKind,
  ) => {
    if (!source || !isFinitePercent(source.usedPercent)) return;
    const percentUsed = clampPercent(source.usedPercent);
    windows.push({
      provider: input.provider,
      window,
      percentUsed,
      resetsAt:
        typeof source.resetsAt === "number"
          ? DateTime.formatIso(DateTime.fromEpochSeconds(source.resetsAt))
          : null,
      severity: severityForPercent(percentUsed, thresholds),
      source: CODX_USAGE_SOURCE,
      sampledAt: input.sampledAt,
    });
  };
  mapWindow(rateLimits?.primary, "primary");
  mapWindow(rateLimits?.secondary, "secondary");
  return {
    provider: input.provider,
    ...(input.providerInstanceId !== undefined
      ? { providerInstanceId: input.providerInstanceId }
      : {}),
    ...(rateLimits?.planType ? { plan: rateLimits.planType } : {}),
    windows,
  };
};
