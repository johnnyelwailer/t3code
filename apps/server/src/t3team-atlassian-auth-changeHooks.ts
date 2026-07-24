/**
 * Cleanup hooks fired whenever the persisted Atlassian auth set changes
 * (basic/OAuth connect, disconnect, test fixture reset). Kept as a single
 * entry point so t3team-atlassian-auth-store.ts only needs one import/call
 * per mutation site instead of growing with every new cache/loop that keys
 * off account identity.
 */
import { stopAllT3TeamAtlassianMirrorSyncs } from "./t3team-atlassian-backlog-mirrorSyncService.ts";
import { invalidateT3TeamTempoIssueKeyCache } from "./t3team-tempoIssueKeyCache.ts";
import { invalidateT3TeamAtlassianViewerAccountIdCache } from "./t3team-atlassian-viewer-identity.ts";

/**
 * A reconnect can swap in a different Atlassian user/site for the same
 * account id, or drop an account's auth entirely, so every account-keyed
 * cache and background loop must be invalidated/stopped rather than trusting
 * stale state to expire on its own.
 */
export function invalidateT3TeamAtlassianAuthDependents(): void {
  invalidateT3TeamAtlassianViewerAccountIdCache();
  invalidateT3TeamTempoIssueKeyCache();
  stopAllT3TeamAtlassianMirrorSyncs();
}
