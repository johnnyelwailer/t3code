import type { JiraApiAuth } from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import {
  atlassianAuths,
  persistAuthsToDisk,
  reloadAuthsFromDisk,
} from "./t3team-atlassian-auth-state.ts";
import { markNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";

const OAUTH_REFRESH_SKEW_MS = 60_000;

/** True when an OAuth access token is expired or about to be, so it must be refreshed first. */
export function oauthAuthExpiresSoon(auth: JiraApiAuth, now: number): boolean {
  return auth.kind === "oauth" && auth.expiresAt !== undefined
    ? auth.expiresAt - now <= OAUTH_REFRESH_SKEW_MS
    : false;
}

/**
 * The refresh grant rejected `redeemed` as dead. Another installation sharing the secret may have
 * rotated it a moment ago: if the secret now holds a different, current token, use that. Otherwise
 * keep the account, flag it needs-reconnect and fail with the typed sign-in error. Never delete the
 * credentials: that turned every rotation conflict into a silent sign-out on the next start.
 *
 * Callers hold the store lock.
 */
export function recoverFromDeadRefreshToken(accountId: string, redeemed: string) {
  return Effect.gen(function* () {
    yield* reloadAuthsFromDisk;
    const current = atlassianAuths.get(accountId);
    const now = yield* Clock.currentTimeMillis;
    if (
      current?.kind === "oauth" &&
      current.refreshToken !== redeemed &&
      !oauthAuthExpiresSoon(current, now)
    ) {
      return current;
    }
    return yield* markNeedsReconnect(accountId, persistAuthsToDisk);
  });
}
