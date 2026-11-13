/**
 * The model menu and Settings must show the same account state from one source: the provider
 * probe (`ServerProvider.auth.status`) that Settings already uses. A lapsed CLI grant can leave
 * the tool-auth stream on `connected`, which made the menu say "Signed in" and loop on Check again.
 */
import type { ToolAuthState } from "@t3tools/contracts";

import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";

/** The provider probe says this account is not signed in — the same fact Settings uses. */
export function isProviderAuthUnauthenticated(
  entry: Pick<ProviderInstanceEntry, "snapshot"> | undefined,
): boolean {
  return entry?.snapshot.auth.status === "unauthenticated";
}

/**
 * If the tool-auth stream still says `connected` but the provider probe says unauthenticated,
 * present the card as expired (Reconnect / sign in) so the two surfaces agree.
 * Mid-flow phases (awaiting a code, installing) are left alone.
 */
export function reconcileToolAuthWithProvider(
  state: ToolAuthState | undefined,
  providerAuthStatus: string | undefined,
): ToolAuthState | undefined {
  if (state?.phase !== "connected") return state;
  if (providerAuthStatus !== "unauthenticated") return state;
  return { ...state, phase: "expired" };
}

export type ProviderRefreshClassification = "ready" | "unauthenticated" | "notReady";

/** How a provider refresh answered, so Check again ends in a definite result. */
export function classifyProviderRefreshResult(
  entry: ProviderInstanceEntry | undefined,
): ProviderRefreshClassification {
  if (entry !== undefined && isProviderInstancePickerReady(entry)) return "ready";
  if (isProviderAuthUnauthenticated(entry)) return "unauthenticated";
  return "notReady";
}
