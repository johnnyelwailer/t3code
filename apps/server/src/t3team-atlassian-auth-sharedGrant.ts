import type { JiraApiAuth } from "@t3tools/integrations-atlassian";

import { setAccountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";

/**
 * One Atlassian sign-in covers every site the user consented to, and the app stores one account per
 * site. All of those accounts hold the same refresh token: one OAuth grant.
 *
 * Atlassian refresh tokens rotate on every use. Refreshing one site's account and writing the new
 * token to that account alone leaves its sibling holding the redeemed token. The sibling's next
 * refresh then reuses a rotated token. Within Atlassian's 10 minute leeway that forks the grant;
 * after it, Atlassian treats it as token reuse and revokes every refresh token of the grant. Both
 * sites then ask the user to sign in again, typically on the next start after a sleep or a quit.
 *
 * So a refresh is applied to the whole grant: every OAuth account still holding the redeemed token
 * takes the new access token, refresh token and expiry, and keeps its own site.
 */
function accountIdsSharingRefreshToken(
  auths: ReadonlyMap<string, JiraApiAuth>,
  refreshToken: string,
): string[] {
  const accountIds: string[] = [];
  for (const [accountId, auth] of auths) {
    if (auth.kind === "oauth" && auth.refreshToken === refreshToken) accountIds.push(accountId);
  }
  return accountIds;
}

export function applyRefreshToGrant(
  auths: Map<string, JiraApiAuth>,
  input: {
    readonly accountId: string;
    readonly redeemedRefreshToken: string;
    readonly refreshed: JiraApiAuth;
  },
): void {
  const { refreshed } = input;
  auths.set(input.accountId, refreshed);
  if (refreshed.kind !== "oauth") return;
  for (const accountId of accountIdsSharingRefreshToken(auths, input.redeemedRefreshToken)) {
    const sibling = auths.get(accountId);
    if (accountId === input.accountId || sibling?.kind !== "oauth") continue;
    auths.set(accountId, {
      ...sibling,
      accessToken: refreshed.accessToken,
      ...(refreshed.refreshToken !== undefined ? { refreshToken: refreshed.refreshToken } : {}),
      ...(refreshed.expiresAt !== undefined ? { expiresAt: refreshed.expiresAt } : {}),
    });
  }
}

/**
 * A dead refresh token is dead for every account of its grant. Flag the siblings with it, so none of
 * them redeems the same token again (another reuse) and every site shows the sign-in prompt at once.
 */
export function flagGrantNeedsReconnect(
  auths: ReadonlyMap<string, JiraApiAuth>,
  deadRefreshToken: string,
): void {
  for (const accountId of accountIdsSharingRefreshToken(auths, deadRefreshToken)) {
    setAccountNeedsReconnect(accountId, true);
  }
}
