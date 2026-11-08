/**
 * Behind `AGENTS_PREFER_READY_PROVIDER`: a thread that would start on a provider that cannot start
 * (its CLI is missing or failing) starts on a ready one instead.
 *
 * Upstream keeps the requested provider whenever it is enabled and not marked unavailable, even
 * with `status: "error"`, so the user lands on its error banner ("Could not start Codex CLI") and
 * has to switch by hand. That is right for a machine whose owner installs Codex, and wrong on a
 * cloud session VM where the Nexplore AI provider is the only one that can run.
 *
 * Only a provider that reports `error` loses its place, and only to a provider that is ready: a
 * provider still being probed (`warning`) or a request with no ready alternative is untouched.
 */
import type { ProviderInstanceId } from "@t3tools/contracts";

import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "./providerInstances";

/**
 * The entry to select instead of the first requested candidate, or `undefined` to keep the usual
 * choice. `entries` are the compatible entries in display order.
 */
export function resolveReadyProviderOverride(input: {
  readonly entries: ReadonlyArray<ProviderInstanceEntry>;
  readonly candidateInstanceIds: ReadonlyArray<ProviderInstanceId | null | undefined>;
}): ProviderInstanceEntry | undefined {
  const requested = input.candidateInstanceIds
    .map((candidate) => input.entries.find((entry) => entry.instanceId === candidate))
    .find((entry) => entry !== undefined && entry.enabled && entry.isAvailable);
  if (requested === undefined || requested.status !== "error") return undefined;
  return input.entries.find(isProviderInstancePickerReady);
}
