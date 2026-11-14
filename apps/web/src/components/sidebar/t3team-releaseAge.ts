import { formatRelativeTimeLabel } from "../../timestampFormat";

/**
 * Feed times read "3h ago"; build days from a prerelease version read "today" or "2d ago".
 * Same reading as the upstream release-notes popover, which keeps its copy private.
 */
export function formatReleaseAge(releasedAt: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releasedAt);
  if (!day) return formatRelativeTimeLabel(releasedAt);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round(
    (today - Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))) / 86_400_000,
  );
  return days <= 0 ? "today" : `${days}d ago`;
}
