/**
 * Provider usage-limit view for agents (`t3team.runtime.provider_usage`) and
 * the shared severity rule the usage watcher applies.
 *
 * The data is upstream's: every provider instance publishes
 * `ServerProvider.usageLimits` (probe + live `account.rate-limits.updated`
 * merges), and CLIProxyAPI hubs publish `UsageLimitSourceSnapshot`s. This
 * module only projects that data per INSTANCE (per account) and names how
 * close each window is to exhaustion — it never samples anything itself.
 *
 * @module providerUsage
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";
import {
  ServerProviderUsageWindow,
  type ServerProviderUsageLimits,
} from "./providerUsageLimits.ts";
import { UsageLimitSourceId } from "./usageLimitSourceId.ts";

/** Bumped whenever {@link ProviderUsageQueryResult} changes incompatibly. */
export const PROVIDER_USAGE_CONTRACT_VERSION = 2 as const;

/** Used-percent at which a window counts as approaching its limit. */
export const PROVIDER_USAGE_WARNING_PERCENT = 80;
/** Used-percent at which a window counts as exhausted. */
export const PROVIDER_USAGE_CRITICAL_PERCENT = 100;

export const ProviderUsageSeverity = Schema.Literals(["normal", "warning", "critical"]);
export type ProviderUsageSeverity = typeof ProviderUsageSeverity.Type;

export const providerUsageSeverity = (usedPercent: number): ProviderUsageSeverity =>
  usedPercent >= PROVIDER_USAGE_CRITICAL_PERCENT
    ? "critical"
    : usedPercent >= PROVIDER_USAGE_WARNING_PERCENT
      ? "warning"
      : "normal";

/** Limits that carry real window data; `unavailable` or empty means "no data". */
export const hasUsageData = (
  limits: ServerProviderUsageLimits | undefined,
): limits is ServerProviderUsageLimits =>
  limits !== undefined && limits.unavailable === undefined && limits.windows.length > 0;

/**
 * The account's short rolling window: `kind: "session"` first, else the
 * shortest known `windowDurationMins`. Null when there is no data.
 */
export const sessionUsageWindow = (
  limits: ServerProviderUsageLimits | undefined,
): ServerProviderUsageWindow | null => {
  if (!hasUsageData(limits)) return null;
  const session = limits.windows.find((window) => window.kind === "session");
  if (session !== undefined) return session;
  const timed = limits.windows.filter((window) => window.windowDurationMins !== undefined);
  if (timed.length === 0) return null;
  return timed.reduce((shortest, window) =>
    window.windowDurationMins! < shortest.windowDurationMins! ? window : shortest,
  );
};

/** Windows at or above the critical threshold (any kind — a weekly wall blocks too). */
export const exhaustedUsageWindows = (
  limits: ServerProviderUsageLimits | undefined,
): ReadonlyArray<ServerProviderUsageWindow> =>
  hasUsageData(limits)
    ? limits.windows.filter((window) => window.usedPercent >= PROVIDER_USAGE_CRITICAL_PERCENT)
    : [];

export const ProviderUsageWindowView = Schema.Struct({
  ...ServerProviderUsageWindow.fields,
  severity: ProviderUsageSeverity,
});
export type ProviderUsageWindowView = typeof ProviderUsageWindowView.Type;

/** One configured provider instance (one account) and its windows. */
export const ProviderUsageInstanceReport = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  driver: ProviderDriverKind,
  displayName: Schema.optional(TrimmedNonEmptyString),
  checkedAt: Schema.optional(IsoDateTime),
  /** Severity of the session window; null when the instance reports no data. */
  sessionSeverity: Schema.NullOr(ProviderUsageSeverity),
  windows: Schema.Array(ProviderUsageWindowView),
  /** Why no windows are reported (`unsupported` account, failed probe, never probed). */
  unavailable: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderUsageInstanceReport = typeof ProviderUsageInstanceReport.Type;

/** One account a usage-limit hub (CLIProxyAPI) reports on; not runnable here. */
export const ProviderUsageHubAccount = Schema.Struct({
  sourceId: UsageLimitSourceId,
  sourceLabel: TrimmedNonEmptyString,
  accountId: TrimmedNonEmptyString,
  driver: ProviderDriverKind,
  plan: Schema.optional(TrimmedNonEmptyString),
  checkedAt: IsoDateTime,
  sessionSeverity: Schema.NullOr(ProviderUsageSeverity),
  windows: Schema.Array(ProviderUsageWindowView),
});
export type ProviderUsageHubAccount = typeof ProviderUsageHubAccount.Type;

/** The full answer to one `t3team.runtime.provider_usage` call. */
export const ProviderUsageQueryResult = Schema.Struct({
  contractVersion: Schema.Literal(PROVIDER_USAGE_CONTRACT_VERSION),
  instances: Schema.Array(ProviderUsageInstanceReport),
  hubAccounts: Schema.Array(ProviderUsageHubAccount),
  /** Hubs that could not be read this time, with their error. */
  hubErrors: Schema.Array(
    Schema.Struct({ sourceId: UsageLimitSourceId, error: TrimmedNonEmptyString }),
  ),
});
export type ProviderUsageQueryResult = typeof ProviderUsageQueryResult.Type;
