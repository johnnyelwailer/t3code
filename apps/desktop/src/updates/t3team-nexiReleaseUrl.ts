import type { DesktopUpdateState } from "@t3tools/contracts";

/**
 * The feed's release page rides along with the offered version: a new offer replaces it, and a
 * re-offer of the queued installer without one keeps the page it already had.
 */
export function withOfferedReleaseUrl(
  next: DesktopUpdateState,
  previous: DesktopUpdateState,
  offered: string | undefined,
): DesktopUpdateState {
  const { releaseUrl: _stale, ...withoutUrl } = next;
  const kept = offered || (next.downloadedVersion !== null ? previous.releaseUrl : undefined);
  return kept && next.availableVersion !== null ? { ...withoutUrl, releaseUrl: kept } : withoutUrl;
}
