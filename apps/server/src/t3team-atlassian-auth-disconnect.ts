import * as Effect from "effect/Effect";

import { invalidateT3TeamAtlassianAuthDependents } from "./t3team-atlassian-auth-changeHooks.ts";
import { setAccountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import {
  atlassianAuths,
  persistAuthsToDisk,
  reloadAuthsFromDisk,
  withAuthStoreLock,
} from "./t3team-atlassian-auth-state.ts";

/**
 * Forget one account's stored credentials and stop everything that polls Jira with them. Synced
 * mirror data stays on disk: signing in again picks it up where it left off. Returns whether the
 * account existed.
 */
export function disconnectAtlassianAccount(accountId: string) {
  return withAuthStoreLock(
    Effect.gen(function* () {
      yield* reloadAuthsFromDisk;
      if (!atlassianAuths.delete(accountId)) return false;
      setAccountNeedsReconnect(accountId, false);
      yield* persistAuthsToDisk;
      invalidateT3TeamAtlassianAuthDependents();
      return true;
    }),
  );
}
