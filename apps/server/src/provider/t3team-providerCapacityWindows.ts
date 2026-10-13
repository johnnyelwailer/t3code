/**
 * Provider capacity windows — the derivation from the published usage
 * snapshots the Usage tab renders (`ServerProvider.usageLimits` plus the hub
 * `usageLimitSources` accounts) to per-window capacity: pool, percent, reset
 * time, severity. Pool names and reset wording come from the contracts
 * renderers the turn-start block uses, so both surfaces say the same thing.
 *
 * @module t3team-providerCapacityWindows
 */
import {
  formatProviderUsageReset,
  providerUsageLabel,
  providerUsagePoolName,
  providerUsageSeverity,
  type ProviderUsageSeverity,
  type ServerProvider,
  type ServerProviderUsageWindow,
  type UsageLimitSourceSnapshot,
} from "@t3tools/contracts";
import type * as DateTime from "effect/DateTime";

export interface ProviderCapacityWindow {
  /** Stable per pool across reads; keys the burn-rate history. */
  readonly sampleKey: string;
  readonly kind: ServerProviderUsageWindow["kind"];
  /** The pool as the notice states it: label plus a data-backed duration. */
  readonly pool: string;
  readonly usedPercent: number;
  readonly resetsAt: string | undefined;
  /** "HH:MM UTC" for a reset on today's UTC date, full date otherwise. */
  readonly resetsDisplay: string | undefined;
  readonly severity: ProviderUsageSeverity;
}

export interface ProviderCapacityInstance {
  readonly displayName: string;
  readonly windows: ProviderCapacityWindow[];
  /** Set when the instance reports no windows; mirrors the tab's state. */
  readonly unavailable: string | undefined;
}

export interface ProviderCapacityHubAccount {
  /** "driver · email" — who the hub is reporting for. */
  readonly subject: string;
  readonly windows: ProviderCapacityWindow[];
}

export interface ProviderCapacityHubError {
  readonly sourceLabel: string;
  readonly error: string;
}

const capacityWindow = (
  window: ServerProviderUsageWindow,
  sampleKeyPrefix: string,
  now: DateTime.DateTime,
): ProviderCapacityWindow => ({
  sampleKey: `${sampleKeyPrefix}:${window.id}`,
  kind: window.kind,
  pool: providerUsagePoolName(window),
  usedPercent: window.usedPercent,
  resetsAt: window.resetsAt,
  resetsDisplay:
    window.resetsAt !== undefined ? formatProviderUsageReset(window.resetsAt, now) : undefined,
  severity: providerUsageSeverity(window.usedPercent),
});

const unavailableReason = (provider: ServerProvider): string | undefined => {
  const limits = provider.usageLimits;
  if (provider.availability === "unavailable" && provider.unavailableReason !== undefined) {
    return `provider unavailable (${provider.unavailableReason})`;
  }
  if (limits === undefined) return "no usage windows reported";
  if (limits.unavailable === undefined) return undefined;
  const { reason, message } = limits.unavailable;
  return message !== undefined
    ? `no usage windows (${reason}: ${message})`
    : `no usage windows (${reason})`;
};

export const capacityFromProvider = (
  provider: ServerProvider,
  now: DateTime.DateTime,
): ProviderCapacityInstance => ({
  displayName: providerUsageLabel(provider),
  windows: (provider.usageLimits?.windows ?? []).map((window) =>
    capacityWindow(window, provider.instanceId, now),
  ),
  unavailable: unavailableReason(provider),
});

export const hubCapacityFromSources = (
  sources: ReadonlyArray<UsageLimitSourceSnapshot>,
  now: DateTime.DateTime,
): {
  readonly accounts: ProviderCapacityHubAccount[];
  readonly errors: ProviderCapacityHubError[];
} => ({
  accounts: sources.flatMap((source) =>
    source.accounts.map((account) => ({
      subject:
        account.email !== undefined ? `${account.driver} · ${account.email}` : account.driver,
      windows: account.usageLimits.windows.map((window) =>
        capacityWindow(window, `hub:${source.label}:${account.id}`, now),
      ),
    })),
  ),
  errors: sources.flatMap((source) =>
    source.error === undefined ? [] : [{ sourceLabel: source.label, error: source.error }],
  ),
});
