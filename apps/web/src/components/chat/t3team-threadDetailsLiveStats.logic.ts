import type {
  ProviderInstanceId,
  ServerProvider,
  ServerProviderUsageStat,
} from "@t3tools/contracts";

/** The instance's live stats, or null when it publishes none (every quota provider). */
export function providerUsageStats(
  providerInstanceId: ProviderInstanceId | null,
  providers: readonly ServerProvider[],
): ReadonlyArray<ServerProviderUsageStat> | null {
  if (providerInstanceId === null) return null;
  const stats = providers.find(
    (provider) => provider.instanceId === providerInstanceId,
  )?.usageStats;
  return stats !== undefined && stats.length > 0 ? stats : null;
}
