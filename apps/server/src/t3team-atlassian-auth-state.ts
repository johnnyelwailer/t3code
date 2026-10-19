import type { JiraApiAuth } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

import { withAtlassianAuthFileLock } from "./t3team-atlassian-auth-fileLock.ts";
import { homeIdToPersist, setLoadedSecretHomeId } from "./t3team-atlassian-auth-homeGuard.ts";
import {
  loadPersistedAtlassianAuthsPayload,
  type PersistedAtlassianAuths,
  savePersistedAtlassianAuthsPayload,
} from "./t3team-atlassian-auth-persistence.ts";
import {
  accountNeedsReconnect,
  clearAllNeedsReconnect,
  hasUnsavedReconnectFlags,
  markReconnectFlagsSaved,
  reapplyUnsavedReconnectFlags,
  setAccountNeedsReconnect,
} from "./t3team-atlassian-auth-staleToken.ts";

/**
 * The Atlassian accounts in memory, the persisted secret they mirror, and the one lock every read
 * and write of that pair runs under.
 *
 * The secret can be shared by several installations on one T3 home, so every credential read
 * reloads it. Without a single lock, a reload could land between a refresh's in-memory update and
 * its file write, and put the refresh token it had just redeemed back into memory. The next refresh
 * then redeemed a dead token. Under the lock, the file matches memory whenever the lock is free.
 */
export const atlassianAuths = new Map<string, JiraApiAuth>();

const authStoreLock = Semaphore.makeUnsafe(1);

/**
 * Run `effect` as one critical section over the accounts and their persisted secret: the
 * in-process semaphore first, then the cross-process lock file, so a second server on the same
 * T3 home can not redeem the same single-use refresh token in parallel.
 */
export const withAuthStoreLock = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  authStoreLock.withPermits(1)(withAtlassianAuthFileLock(effect));

function persistedAuthsPayload(homeId: string): PersistedAtlassianAuths {
  return {
    version: 1,
    homeId,
    auths: [...atlassianAuths].map(([accountId, auth]) => ({
      accountId,
      auth,
      ...(accountNeedsReconnect(accountId) ? { needsReconnect: true } : {}),
    })),
  };
}

/**
 * Write memory to the persisted secret. Callers hold the lock. Whatever flags were waiting for a
 * write are in the file once this succeeds.
 */
export const persistAuthsToDisk = Effect.flatMap(homeIdToPersist, (homeId) =>
  savePersistedAtlassianAuthsPayload(persistedAuthsPayload(homeId)),
).pipe(Effect.tap(() => Effect.sync(markReconnectFlagsSaved)));

/**
 * Replace memory with the persisted secret, keeping the flags a refused call raised since the last
 * write and writing them out. Callers hold the lock.
 */
export const reloadAuthsFromDisk = Effect.gen(function* () {
  const parsed = yield* loadPersistedAtlassianAuthsPayload;
  if (parsed) {
    setLoadedSecretHomeId(parsed.homeId);
    atlassianAuths.clear();
    clearAllNeedsReconnect();
    for (const entry of parsed.auths) {
      atlassianAuths.set(entry.accountId, entry.auth);
      setAccountNeedsReconnect(entry.accountId, entry.needsReconnect === true);
    }
  }
  reapplyUnsavedReconnectFlags((accountId) => {
    const auth = atlassianAuths.get(accountId);
    if (!auth) return null;
    return auth.kind === "oauth" ? auth.accessToken : auth.apiToken;
  });
  if (hasUnsavedReconnectFlags()) yield* persistAuthsToDisk.pipe(Effect.ignore);
});
