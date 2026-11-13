/**
 * The one rule about replacing a provider the user or the thread already picked: don't. Two
 * exceptions, neither silent — the caller gets a `ProviderSelectionFallback` to label it: another
 * instance of the same driver (same provider and model, other account) and Nexplore AI. A brand-new thread has no choice to protect, so its default is not covered here.
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
  /** `sameDriver`: another instance of the picked driver; the model stays. */
  readonly kind: "nexplore" | "sameDriver";
  readonly requestedInstanceId: ProviderInstanceId;
  readonly requestedDisplayName: string;
  readonly fallbackInstanceId: ProviderInstanceId;
  readonly fallbackDisplayName: string;
}

export interface ProviderSelectionFallbackResult {
  readonly entry: ProviderInstanceEntry | undefined;
  /** Non-null whenever the entry is not the requested instance; the composer must show it. */
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
  if (resolvedEntry.instanceId === requestedEntry.instanceId) {
    return { entry: resolvedEntry, fallback: null };
  }
  // Another instance of the same driver (a team account for a disabled personal one) keeps the
  // provider and model, but it is still another account, so it is shown too.
  const sameDriver = resolvedEntry.driverKind === requestedEntry.driverKind;
  if (!sameDriver && !isNexploreProviderEntry(resolvedEntry)) {
    return { entry: requestedEntry, fallback: null };
  }
  return {
    entry: resolvedEntry,
    fallback: {
      kind: sameDriver ? "sameDriver" : "nexplore",
      requestedInstanceId: requestedEntry.instanceId,
      requestedDisplayName: requestedEntry.displayName,
      fallbackInstanceId: resolvedEntry.instanceId,
      fallbackDisplayName: resolvedEntry.displayName,
    },
  };
}
