import {
  AtlassianIntegrationProvider,
  type AtlassianAccessibleResource,
  type JiraApiAuth,
  type TokenExchangeResult,
  refreshAccessToken,
} from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import { invalidateT3TeamAtlassianAuthDependents } from "./t3team-atlassian-auth-changeHooks.ts";
import {
  claimSecretForThisHome,
  secretBelongsToThisHome,
} from "./t3team-atlassian-auth-homeGuard.ts";
import { findAuthForAccountId } from "./t3team-atlassian-auth-lookup.ts";
import {
  applyRefreshToGrant,
  flagGrantNeedsReconnect,
} from "./t3team-atlassian-auth-sharedGrant.ts";
import {
  atlassianAuths,
  persistAuthsToDisk,
  reloadAuthsFromDisk,
  withAuthStoreLock,
} from "./t3team-atlassian-auth-state.ts";
import {
  oauthAuthExpiresSoon,
  recheckAfterDeadRefreshToken,
} from "./t3team-atlassian-auth-deadToken.ts";
import {
  accountNeedsReconnect,
  markNeedsReconnect,
  reconnectRequiredError,
  resetAllNeedsReconnect,
} from "./t3team-atlassian-auth-staleToken.ts";
import {
  ATLASSIAN_OAUTH_ENV_HINT,
  readAtlassianOAuthClientId,
  readAtlassianOAuthClientSecret,
} from "./t3team-atlassian-oauthEnv.ts";
import { JIRA_OAUTH_CONFIG_CODE } from "./t3team-atlassian-errors.ts";
import { logRefreshAttempt, refreshFailureDetails } from "./t3team-atlassian-auth-refreshTrace.ts";
import { t3teamFixtureOrMockProvider } from "./t3team-fixtureProjectRegistry.ts";

export type BasicConnectInput = {
  readonly auth: {
    readonly kind: "basic";
    readonly siteUrl: string;
    readonly email: string;
    readonly apiToken: string;
  };
};

export type OAuthConnectInput = {
  readonly auth: {
    readonly kind: "oauth";
    readonly sites: ReadonlyArray<AtlassianAccessibleResource>;
    readonly token: TokenExchangeResult;
  };
};

export const loadPersistedAuths = withAuthStoreLock(reloadAuthsFromDisk);

export const savePersistedAuths = withAuthStoreLock(persistAuthsToDisk);

/**
 * Replace the persisted accounts (basic/OAuth connect) in one critical section, so a concurrent
 * reload can not swap the old secret back in between the new accounts and their file write.
 */
export function commitAtlassianAuths(
  entries: ReadonlyArray<{ readonly accountId: string; readonly auth: JiraApiAuth }>,
) {
  return withAuthStoreLock(
    Effect.suspend(() => {
      replaceAtlassianAuths(entries);
      return persistAuthsToDisk;
    }),
  );
}

function atlassianOAuthClientConfig(): { clientId: string; clientSecret?: string } {
  const clientId = readAtlassianOAuthClientId();
  const clientSecret = readAtlassianOAuthClientSecret() || undefined;
  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
  };
}

/** Callers hold the store lock, so no reload or second refresh can interleave with this one. */
function refreshOAuthAuthIfNeeded(accountId: string, listedAuth: JiraApiAuth) {
  return Effect.gen(function* () {
    // A sibling account's refresh earlier in this pass may already have renewed this grant.
    const auth = atlassianAuths.get(accountId) ?? listedAuth;
    // A dead refresh token never comes back; fail with the sign-in error instead of re-hitting Atlassian.
    if (accountNeedsReconnect(accountId)) {
      return yield* reconnectRequiredError();
    }
    if (auth.kind !== "oauth" || auth.expiresAt === undefined) {
      return auth;
    }

    const now = yield* Clock.currentTimeMillis;
    if (!oauthAuthExpiresSoon(auth, now)) {
      return auth;
    }

    const refreshToken = auth.refreshToken;
    if (!refreshToken) {
      return yield* markNeedsReconnect(accountId, persistAuthsToDisk, "no-refresh-token");
    }

    const config = atlassianOAuthClientConfig();
    const clientSecretPresent = config.clientSecret !== undefined;
    // A copy of another installation's secret must never rotate the shared refresh token: that
    // signs the real installation out. Keep the account unflagged and report it instead.
    if (!(yield* secretBelongsToThisHome)) {
      yield* logRefreshAttempt({ accountId, outcome: "copied-secret", clientSecretPresent });
      return yield* copiedSecretError();
    }
    if (!config.clientId) {
      yield* logRefreshAttempt({ accountId, outcome: "missing-client-id", clientSecretPresent });
      return auth;
    }
    // Atlassian rejects a refresh without the client secret. Redeeming anyway only burned the
    // single-use token and flagged the account, so a launch without the secret looked like a
    // signed-out session on every later start. Report the setup problem instead, unflagged.
    if (!clientSecretPresent) {
      yield* logRefreshAttempt({
        accountId,
        outcome: "missing-client-secret",
        clientSecretPresent,
      });
      return yield* oauthConfigError();
    }

    const outcome = yield* tryAtlassianPromise(
      () => refreshAccessToken(config, refreshToken),
      "Failed to refresh Atlassian OAuth token.",
    ).pipe(
      Effect.map((token): RefreshResult => ({
        _tag: "refreshed",
        auth: {
          kind: "oauth",
          cloudId: auth.cloudId,
          ...(auth.siteUrl ? { siteUrl: auth.siteUrl } : {}),
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: now + token.expiresIn * 1000,
        },
      })),
      Effect.catch((error) =>
        Effect.gen(function* () {
          const details = refreshFailureDetails(error);
          // Always re-read once on a session-expired class response. Another installation (or a
          // crash between Atlassian redeem and our persist) may have written a newer token.
          if (details.refreshTokenInvalid || details.sessionExpiredResponse) {
            const rechecked = yield* recheckAfterDeadRefreshToken(accountId, refreshToken);
            if (rechecked._tag === "adopted" || rechecked._tag === "newer-on-disk") {
              yield* logRefreshAttempt({
                accountId,
                outcome: "adopted-newer-token",
                clientSecretPresent,
                details,
              });
              return { _tag: "unchanged", auth: rechecked.auth } satisfies RefreshResult;
            }
            if (rechecked._tag === "gone") {
              yield* logRefreshAttempt({
                accountId,
                outcome: "refresh-token-invalid",
                clientSecretPresent,
                details,
              });
              return yield* reconnectRequiredError();
            }
            // Same dead token still on disk. invalid_grant / "refresh_token is invalid" means the
            // session is gone; a bare unauthorized_client is a client-id/secret mismatch.
            if (details.refreshTokenInvalid) {
              yield* logRefreshAttempt({
                accountId,
                outcome: "refresh-token-invalid",
                clientSecretPresent,
                details,
              });
              flagGrantNeedsReconnect(atlassianAuths, refreshToken);
              return yield* markNeedsReconnect(
                accountId,
                persistAuthsToDisk,
                "refresh-token-invalid",
              );
            }
            yield* logRefreshAttempt({
              accountId,
              outcome: "client-rejected",
              clientSecretPresent,
              details,
            });
            return yield* oauthConfigError();
          }
          yield* logRefreshAttempt({
            accountId,
            outcome: "failed",
            clientSecretPresent,
            details,
          });
          return yield* Effect.fail(error);
        }),
      ),
    );
    if (outcome._tag === "unchanged") return outcome.auth;
    yield* logRefreshAttempt({ accountId, outcome: "refreshed", clientSecretPresent });
    applyRefreshToGrant(atlassianAuths, {
      accountId,
      redeemedRefreshToken: refreshToken,
      refreshed: outcome.auth,
    });
    yield* persistAuthsToDisk;
    return outcome.auth;
  });
}

type RefreshResult =
  | { readonly _tag: "refreshed"; readonly auth: JiraApiAuth }
  | { readonly _tag: "unchanged"; readonly auth: JiraApiAuth };

function copiedSecretError() {
  return new T3TeamAtlassianError({
    code: JIRA_OAUTH_CONFIG_CODE,
    message:
      "Jira sign-in can not be renewed here: these credentials were copied from another installation. Sign in to Jira again on this one.",
  });
}

function oauthConfigError() {
  return new T3TeamAtlassianError({
    code: JIRA_OAUTH_CONFIG_CODE,
    message: `Jira sign-in can not be renewed: the Atlassian OAuth client is not configured correctly (${ATLASSIAN_OAUTH_ENV_HINT}).`,
  });
}

export function providerForAccount(accountId: string) {
  return withAuthStoreLock(
    Effect.gen(function* () {
      yield* reloadAuthsFromDisk;
      const resolved = findAuthForAccountId(atlassianAuths, accountId);
      return resolved
        ? new AtlassianIntegrationProvider(
            yield* refreshOAuthAuthIfNeeded(resolved.accountId, resolved.auth),
          )
        : yield* t3teamFixtureOrMockProvider(accountId);
    }),
  );
}

export function providerForPersistedAuths() {
  return withAuthStoreLock(
    Effect.gen(function* () {
      yield* reloadAuthsFromDisk;
      const refreshResults = yield* Effect.all(
        [...atlassianAuths].map(([accountId, auth]) =>
          refreshOAuthAuthIfNeeded(accountId, auth).pipe(
            Effect.map((refreshedAuth) => ({ _tag: "success" as const, auth: refreshedAuth })),
            Effect.catch((error) => Effect.succeed({ _tag: "failure" as const, accountId, error })),
          ),
        ),
      );
      const auths: JiraApiAuth[] = [];
      for (const result of refreshResults) {
        if (result._tag === "success") {
          auths.push(result.auth);
        }
      }
      if (auths.length === 0) {
        const failure = refreshResults.find((result) => result._tag === "failure");
        if (failure) {
          return yield* failure.error;
        }
      }
      return auths.length > 0 ? AtlassianIntegrationProvider.fromMultipleAuths(auths) : null;
    }),
  );
}

/**
 * Replace the whole persisted-auths set (basic/OAuth connect, test fixture
 * reset). Invalidates the cached viewer accountIds too: a reconnect can swap
 * in a different Atlassian user for the same account id, and a stale cached
 * accountId would silently keep serving the previous person's My Work.
 */
export function replaceAtlassianAuths(
  entries: ReadonlyArray<{ readonly accountId: string; readonly auth: JiraApiAuth }>,
): void {
  atlassianAuths.clear();
  resetAllNeedsReconnect();
  claimSecretForThisHome();
  for (const entry of entries) {
    atlassianAuths.set(entry.accountId, entry.auth);
  }
  invalidateT3TeamAtlassianAuthDependents();
}
