/**
 * The one rule about replacing a provider the user or the thread already picked: don't. Nexplore
 * AI is the single exception and is never silent — the caller gets a `ProviderSelectionFallback`
 * to label it. A brand-new thread has no choice to protect, so its default is not covered here.
 * @module t3team/providerSelectionFallback
 */
import type { ProviderInstanceId } from "@t3tools/contracts";

import type { ProviderInstanceEntry } from "./providerInstances";

/** The provider that may be fallen back to automatically. */
const NEXPLORE_DRIVER_KIND = "nexplore";

export function isNexploreProviderEntry(entry: ProviderInstanceEntry | undefined): boolean {
  return entry?.driverKind === NEXPLORE_DRIVER_KIND;
}

export interface ProviderSelectionFallback {
  readonly requestedInstanceId: ProviderInstanceId;
  readonly requestedDisplayName: string;
  readonly fallbackInstanceId: ProviderInstanceId;
  readonly fallbackDisplayName: string;
}

export interface ProviderSelectionFallbackResult {
  readonly entry: ProviderInstanceEntry | undefined;
  /** Non-null only for the allowed Nexplore AI swap, and only then must it be shown. */
  readonly fallback: ProviderSelectionFallback | null;
}

/**
 * `requestedEntry` is the instance the draft, thread or runtime asked for, as this machine knows
 * it; `undefined` when nothing was asked for or the request names an instance this machine does
 * not have, which is the brand-new-thread case where a default is correct.
 */
export function applyProviderSelectionFallbackRule(input: {
  readonly requestedEntry: ProviderInstanceEntry | undefined;
  readonly resolvedEntry: ProviderInstanceEntry | undefined;
}): ProviderSelectionFallbackResult {
  const { requestedEntry, resolvedEntry } = input;
  if (requestedEntry === undefined || resolvedEntry === undefined) {
    return { entry: resolvedEntry, fallback: null };
  }
  // Another instance of the same driver (a team account for a disabled personal one) keeps the
  // provider and model the user picked, so it is not a switch.
  if (
    resolvedEntry.instanceId === requestedEntry.instanceId ||
    resolvedEntry.driverKind === requestedEntry.driverKind
  ) {
    return { entry: resolvedEntry, fallback: null };
  }
  if (!isNexploreProviderEntry(resolvedEntry)) {
    return { entry: requestedEntry, fallback: null };
  }
  return {
    entry: resolvedEntry,
    fallback: {
      requestedInstanceId: requestedEntry.instanceId,
      requestedDisplayName: requestedEntry.displayName,
      fallbackInstanceId: resolvedEntry.instanceId,
      fallbackDisplayName: resolvedEntry.displayName,
    },
  };
}
