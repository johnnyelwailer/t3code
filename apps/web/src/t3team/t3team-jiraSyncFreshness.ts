/** A Jira sync older than this is no longer the user's current work, and the UI says so. */
export const JIRA_SYNC_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isJiraSyncStale(syncedAt: string | undefined, nowMs: number): boolean {
  if (syncedAt === undefined) return false;
  const syncedAtMs = Date.parse(syncedAt);
  return !Number.isNaN(syncedAtMs) && nowMs - syncedAtMs > JIRA_SYNC_STALE_AFTER_MS;
}
