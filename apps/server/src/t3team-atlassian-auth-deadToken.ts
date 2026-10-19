// @effect-diagnostics globalTimers:off - the re-check pause waits for another process in real time, outside the TestClock.
import type { JiraApiAuth } from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { atlassianAuths, reloadAuthsFromDisk } from "./t3team-atlassian-auth-state.ts";

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

export type DeadTokenRecheck =
  | { readonly _tag: "adopted"; readonly auth: JiraApiAuth }
  | { readonly _tag: "newer-on-disk"; readonly auth: JiraApiAuth }
  | { readonly _tag: "same"; readonly auth: JiraApiAuth }
  | { readonly _tag: "gone" };

/**
 * Pause briefly and re-read the secret after Atlassian refused `redeemed`. Another installation
 * sharing the secret may have rotated it a moment ago (one without the cross-process lock may still
 * be writing). Callers hold the store lock and decide whether to flag, adopt, or report a config
 * error — this never writes the reconnect flag by itself.
 */
export function recheckAfterDeadRefreshToken(accountId: string, redeemed: string) {
  return Effect.gen(function* () {
    if (deadTokenRecheckDelayMs > 0) {
      const delay = deadTokenRecheckDelayMs;
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, delay)));
    }
    yield* reloadAuthsFromDisk;
    const current = atlassianAuths.get(accountId);
    const now = yield* Clock.currentTimeMillis;
    if (!current) return { _tag: "gone" } satisfies DeadTokenRecheck;
    if (current.kind === "oauth" && current.refreshToken !== redeemed) {
      if (!oauthAuthExpiresSoon(current, now)) {
        return { _tag: "adopted", auth: current } satisfies DeadTokenRecheck;
      }
      return { _tag: "newer-on-disk", auth: current } satisfies DeadTokenRecheck;
    }
    return { _tag: "same", auth: current } satisfies DeadTokenRecheck;
  });
}
