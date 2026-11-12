/**
 * Filters composer banners so a thread shows one cloud-session status.
 * Matches CloudSession.tla ApplyFix = TRUE: no ended, clone, offline, or
 * bind banner while the setup card is up; no clone banner at all (folded
 * into the card); ended only when nothing is being set up and the user is
 * not already starting another session. Other banners (provider fallback,
 * usage limits, branch mismatch) are left alone.
 */
import type { CloudSessionVisibleStatus } from "./t3team-cloudSessionVisibleStatus";

/** When the live card is up, force one status so banners cannot race it. */
export function withLiveSetupCard(
  status: CloudSessionVisibleStatus,
  setupCardShown: boolean,
): CloudSessionVisibleStatus {
  if (!setupCardShown || status.showSetupCard) return status;
  return {
    ...status,
    kind: "setting_up",
    showSetupCard: true,
    showEndedBanner: false,
    showCloneBanner: false,
    showOfflineBanner: false,
    showQueuedBindBanner: false,
    visible: ["setup"],
  };
}

export const CLOUD_SESSION_ENDED_BANNER_PREFIX = "cloud-session-ended:";
export const CLOUD_SESSION_ENDING_BANNER_PREFIX = "cloud-session-ending:";
export const CLOUD_PROJECT_CLONE_BANNER_PREFIX = "cloud-project-clone:";
export const ENVIRONMENT_UNAVAILABLE_BANNER_PREFIX = "environment-unavailable:";
export const CLOUD_SESSION_BIND_BANNER_PREFIX = "cloud-session-bind:";

export function isCloudSessionEndedBanner(id: string): boolean {
  return id.startsWith(CLOUD_SESSION_ENDED_BANNER_PREFIX);
}
export function isCloudSessionEndingBanner(id: string): boolean {
  return id.startsWith(CLOUD_SESSION_ENDING_BANNER_PREFIX);
}
export function isCloudProjectCloneBanner(id: string): boolean {
  return id.startsWith(CLOUD_PROJECT_CLONE_BANNER_PREFIX);
}
export function isEnvironmentUnavailableBanner(id: string): boolean {
  return id.startsWith(ENVIRONMENT_UNAVAILABLE_BANNER_PREFIX);
}
export function isCloudSessionBindBanner(id: string): boolean {
  return id.startsWith(CLOUD_SESSION_BIND_BANNER_PREFIX);
}

export function applyCloudSessionBannerPolicy<T extends { readonly id: string }>(
  items: ReadonlyArray<T>,
  status: Pick<
    CloudSessionVisibleStatus,
    "showSetupCard" | "showEndedBanner" | "showCloneBanner" | "showQueuedBindBanner"
  >,
): T[] {
  return items.filter((item) => {
    const { id } = item;
    if (isCloudSessionEndedBanner(id)) return status.showEndedBanner;
    if (isCloudSessionEndingBanner(id)) return !status.showSetupCard;
    if (isCloudProjectCloneBanner(id)) return status.showCloneBanner;
    if (isCloudSessionBindBanner(id)) return status.showQueuedBindBanner;
    if (isEnvironmentUnavailableBanner(id)) {
      // Suppress the machine banner while setup or the ended banner already
      // says what is happening; otherwise leave the system's own decision.
      if (status.showSetupCard || status.showEndedBanner) return false;
      return true;
    }
    return true;
  });
}
