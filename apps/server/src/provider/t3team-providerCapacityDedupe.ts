/**
 * Hub-mirror dedupe for provider capacity windows.
 *
 * The same pool can reach an answer twice: once from the live driver probe
 * (`ServerProvider.usageLimits`) and once as a hub mirror of that provider's
 * account (a `UsageLimitSources` snapshot), which lags behind it. A hub window
 * whose pool, kind, and reset time match a live window is that mirror: the live
 * snapshot wins and the hub copy is dropped. Distinct resets are distinct pools;
 * a window with no reset cannot be matched and is kept.
 *
 * @module t3team-providerCapacityDedupe
 */
import {
  providerUsagePoolName,
  type ServerProvider,
  type ServerProviderUsageWindow,
  type UsageLimitSourceSnapshot,
} from "@t3tools/contracts";

/** `pool:kind:resetsAt`; undefined when there is no reset to key on. */
export const dedupeKey = (window: ServerProviderUsageWindow): string | undefined =>
  window.resetsAt === undefined
    ? undefined
    : `${providerUsagePoolName(window)}:${window.kind}:${window.resetsAt}`;

/**
 * The hub sources with every window that mirrors an enabled instance's live
 * window removed. An account the dedupe empties is dropped; an account that
 * reported no windows to begin with is kept so its state stays visible.
 */
export const dedupeHubSources = (
  providers: ReadonlyArray<ServerProvider>,
  sources: ReadonlyArray<UsageLimitSourceSnapshot>,
): UsageLimitSourceSnapshot[] => {
  const liveKeys = new Set(
    providers
      .filter((provider) => provider.enabled)
      .flatMap((provider) => provider.usageLimits?.windows ?? [])
      .flatMap((window) => dedupeKey(window) ?? []),
  );
  if (liveKeys.size === 0) return [...sources];
  return sources.map((source) => ({
    ...source,
    accounts: source.accounts.flatMap((account) => {
      const windows = account.usageLimits.windows.filter((window) => {
        const key = dedupeKey(window);
        return key === undefined || !liveKeys.has(key);
      });
      if (windows.length === 0 && account.usageLimits.windows.length > 0) return [];
      return [{ ...account, usageLimits: { ...account.usageLimits, windows } }];
    }),
  }));
};
