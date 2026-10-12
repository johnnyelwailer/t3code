import type { JiraApiAuth } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

import {
  loadPersistedAtlassianAuthsPayload,
  type PersistedAtlassianAuths,
  savePersistedAtlassianAuthsPayload,
} from "./t3team-atlassian-auth-persistence.ts";
import {
  accountNeedsReconnect,
  clearAllNeedsReconnect,
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

/** Run `effect` as one critical section over the accounts and their persisted secret. */
export const withAuthStoreLock = authStoreLock.withPermits(1);

function persistedAuthsPayload(): PersistedAtlassianAuths {
  return {
    version: 1,
    auths: [...atlassianAuths].map(([accountId, auth]) => ({
      accountId,
      auth,
      ...(accountNeedsReconnect(accountId) ? { needsReconnect: true } : {}),
    })),
  };
}

/** Replace memory with the persisted secret. Callers hold the lock. */
export const reloadAuthsFromDisk = Effect.gen(function* () {
  const parsed = yield* loadPersistedAtlassianAuthsPayload;
  if (!parsed) return;
  atlassianAuths.clear();
  clearAllNeedsReconnect();
  for (const entry of parsed.auths) {
    atlassianAuths.set(entry.accountId, entry.auth);
    setAccountNeedsReconnect(entry.accountId, entry.needsReconnect === true);
  }
});

/** Write memory to the persisted secret. Callers hold the lock. */
export const persistAuthsToDisk = Effect.suspend(() =>
  savePersistedAtlassianAuthsPayload(persistedAuthsPayload()),
);
