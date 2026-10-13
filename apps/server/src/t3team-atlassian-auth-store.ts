import {
  AtlassianIntegrationProvider,
  AtlassianOAuthSessionExpiredError,
  type AtlassianAccessibleResource,
  type JiraApiAuth,
  type TokenExchangeResult,
  refreshAccessToken,
} from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import { invalidateT3TeamAtlassianAuthDependents } from "./t3team-atlassian-auth-changeHooks.ts";
import { findAuthForAccountId } from "./t3team-atlassian-auth-lookup.ts";
import {
  atlassianAuths,
  persistAuthsToDisk,
  reloadAuthsFromDisk,
  withAuthStoreLock,
} from "./t3team-atlassian-auth-state.ts";
import {
  oauthAuthExpiresSoon,
  recoverFromDeadRefreshToken,
} from "./t3team-atlassian-auth-deadToken.ts";
import {
  accountNeedsReconnect,
  markNeedsReconnect,
  reconnectRequiredError,
  resetAllNeedsReconnect,
} from "./t3team-atlassian-auth-staleToken.ts";
import {
  readAtlassianOAuthClientId,
  readAtlassianOAuthClientSecret,
} from "./t3team-atlassian-oauthEnv.ts";
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
function refreshOAuthAuthIfNeeded(accountId: string, auth: JiraApiAuth) {
  return Effect.gen(function* () {
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
      return yield* markNeedsReconnect(accountId, persistAuthsToDisk);
    }

    const config = atlassianOAuthClientConfig();
    if (!config.clientId) {
      return auth;
    }

    const refreshed = yield* tryAtlassianPromise(
      () => refreshAccessToken(config, refreshToken),
      "Failed to refresh Atlassian OAuth token.",
    ).pipe(
      Effect.map((token): JiraApiAuth => ({
        kind: "oauth",
        cloudId: auth.cloudId,
        ...(auth.siteUrl ? { siteUrl: auth.siteUrl } : {}),
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: now + token.expiresIn * 1000,
      })),
      // Only a dead refresh token is terminal; any other failure keeps its original error.
      Effect.catchIf(
        (error) =>
          error instanceof T3TeamAtlassianError &&
          error.cause instanceof AtlassianOAuthSessionExpiredError,
        () => recoverFromDeadRefreshToken(accountId, refreshToken),
      ),
    );
    if (refreshed === atlassianAuths.get(accountId)) {
      return refreshed;
    }
    atlassianAuths.set(accountId, refreshed);
    yield* persistAuthsToDisk;
    return refreshed;
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
  for (const entry of entries) {
    atlassianAuths.set(entry.accountId, entry.auth);
  }
  invalidateT3TeamAtlassianAuthDependents();
}
