/** How long a dismissed resource-pressure banner stays hidden, per thread. */
export const BANNER_DISMISSAL_TTL_MS = 60 * 60 * 1000;

/**
 * While a resource-pressure banner is dismissed it must stay hidden for the full
 * window; it may re-surface only once the window has fully passed (for the next
 * pressure episode, which is critical only after it sustains). `dismissedAtMs` is
 * null until the banner is dismissed for this thread.
 */
export function isResourcePressureBannerSuppressed(
  dismissedAtMs: number | null,
  nowMs: number,
): boolean {
  return dismissedAtMs !== null && nowMs - dismissedAtMs < BANNER_DISMISSAL_TTL_MS;
}
