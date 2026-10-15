// @effect-diagnostics globalTimers:off - the re-check pause waits for another process in real time, outside the TestClock.
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

let deadTokenRecheckDelayMs = 1_000;

/** Test seam: shorten the pause before re-reading the secret after a dead refresh token. */
export function setDeadTokenRecheckDelayMsForTest(ms: number): void {
  deadTokenRecheckDelayMs = ms;
}

/**
 * The refresh grant rejected `redeemed` as dead. Another installation sharing the secret may have
 * rotated it a moment ago (one without the cross-process lock may still be writing), so wait
 * briefly and re-read the secret: if it now holds a different, current token, use that. Otherwise
 * keep the account, flag it needs-reconnect and fail with the typed sign-in error. Never delete the
 * credentials: that turned every rotation conflict into a silent sign-out on the next start.
 *
 * The flag is compare-and-swap on the record: it is written only while the file still holds the
 * token that was rejected, right after the re-read and under the store lock, so it can never
 * overwrite a newer token on disk.
 *
 * Callers hold the store lock.
 */
export function recoverFromDeadRefreshToken(accountId: string, redeemed: string) {
  return Effect.gen(function* () {
    if (deadTokenRecheckDelayMs > 0) {
      const delay = deadTokenRecheckDelayMs;
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, delay)));
    }
    yield* reloadAuthsFromDisk;
    const current = atlassianAuths.get(accountId);
    const now = yield* Clock.currentTimeMillis;
    if (current?.kind === "oauth" && current.refreshToken !== redeemed) {
      if (!oauthAuthExpiresSoon(current, now)) {
        return { _tag: "adopted" as const, auth: current };
      }
      // A newer (but already expiring) token: leave it unflagged for the next refresh to redeem.
      return { _tag: "newer-on-disk" as const, auth: current };
    }
    if (!current) {
      // The account was disconnected meanwhile; nothing to flag.
      return { _tag: "gone" as const };
    }
    return yield* markNeedsReconnect(accountId, persistAuthsToDisk, "refresh-token-invalid");
  });
}
