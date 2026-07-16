/**
 * Cleanup hooks fired whenever the persisted Atlassian auth set changes
 * (basic/OAuth connect, disconnect, test fixture reset). Kept as a single
 * entry point so t3work-atlassian-auth-store.ts only needs one import/call
 * per mutation site instead of growing with every new cache/loop that keys
 * off account identity.
 */
import { stopAllT3workAtlassianMirrorSyncs } from "./t3work-atlassian-backlog-mirrorSyncService.ts";
import { invalidateT3workTempoIssueKeyCache } from "./t3work-tempoIssueKeyCache.ts";
import { invalidateT3workAtlassianViewerAccountIdCache } from "./t3work-atlassian-viewer-identity.ts";

/**
 * A reconnect can swap in a different Atlassian user/site for the same
 * account id, or drop an account's auth entirely, so every account-keyed
 * cache and background loop must be invalidated/stopped rather than trusting
 * stale state to expire on its own.
 */
export function invalidateT3workAtlassianAuthDependents(): void {
  invalidateT3workAtlassianViewerAccountIdCache();
  invalidateT3workTempoIssueKeyCache();
  stopAllT3workAtlassianMirrorSyncs();
}
