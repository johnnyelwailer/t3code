import {
  AtlassianIntegrationProvider,
  type AtlassianAccessibleResource,
  type JiraApiAuth,
  type TokenExchangeResult,
  refreshAccessToken,
} from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";
import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import {
  loadPersistedAtlassianAuthsPayload,
  type PersistedAtlassianAuths,
  savePersistedAtlassianAuthsPayload,
} from "./t3team-atlassian-auth-persistence.ts";
import { invalidateT3TeamAtlassianAuthDependents } from "./t3team-atlassian-auth-changeHooks.ts";
import { findAuthForAccountId } from "./t3team-atlassian-auth-lookup.ts";
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

const atlassianAuths = new Map<string, JiraApiAuth>();
const OAUTH_REFRESH_SKEW_MS = 60_000;

// Concurrent writers race the atomic tmp-write-then-rename in persistence,
// which fails on Windows when two renames target the secret file at once.
const persistedAuthsSaveSemaphore = Semaphore.makeUnsafe(1);

// Atlassian rotates refresh tokens: two concurrent refreshes for one account
// would each redeem the same token, and the loser invalidates the winner.
const oauthRefreshSemaphore = Semaphore.makeUnsafe(1);

function persistedAuthsPayload(): PersistedAtlassianAuths {
  return {
    version: 1,
    auths: [...atlassianAuths].map(([accountId, auth]) => ({ accountId, auth })),
  };
}

export const loadPersistedAuths = Effect.gen(function* () {
  const parsed = yield* loadPersistedAtlassianAuthsPayload;
  if (!parsed) return;
  atlassianAuths.clear();
  for (const entry of parsed.auths) {
    atlassianAuths.set(entry.accountId, entry.auth);
  }
});

export const savePersistedAuths = persistedAuthsSaveSemaphore.withPermits(1)(
  Effect.suspend(() => savePersistedAtlassianAuthsPayload(persistedAuthsPayload())),
);

function missingRefreshTokenError() {
  return new T3TeamAtlassianError({
    message:
      "Atlassian OAuth token expired and no refresh token is stored. Reconnect Atlassian to grant offline access.",
  });
}

function atlassianOAuthClientConfig(): { clientId: string; clientSecret?: string } {
  const clientId = readAtlassianOAuthClientId();
  const clientSecret = readAtlassianOAuthClientSecret() || undefined;
  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
  };
}

function refreshOAuthAuthIfNeeded(accountId: string, initialAuth: JiraApiAuth) {
  const refresh = Effect.gen(function* () {
    // Re-read under the permit: a concurrent caller may have refreshed this
    // account while we waited, and its rotated token is the only valid one.
    const auth = atlassianAuths.get(accountId) ?? initialAuth;
    if (auth.kind !== "oauth" || auth.expiresAt === undefined) {
      return auth;
    }

    const now = yield* Clock.currentTimeMillis;
    if (auth.expiresAt - now > OAUTH_REFRESH_SKEW_MS) {
      return auth;
    }

    if (!auth.refreshToken) {
      return yield* missingRefreshTokenError();
    }

    const config = atlassianOAuthClientConfig();
    if (!config.clientId) {
      return auth;
    }

    const token = yield* tryAtlassianPromise(
      () => refreshAccessToken(config, auth.refreshToken!),
      "Failed to refresh Atlassian OAuth token.",
    );
    const nextAuth: JiraApiAuth = {
      kind: "oauth",
      cloudId: auth.cloudId,
      ...(auth.siteUrl ? { siteUrl: auth.siteUrl } : {}),
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: now + token.expiresIn * 1000,
    };
    atlassianAuths.set(accountId, nextAuth);
    yield* savePersistedAuths;
    return nextAuth;
  });
  return oauthRefreshSemaphore.withPermits(1)(refresh);
}

export function providerForAccount(accountId: string) {
  return Effect.gen(function* () {
    yield* loadPersistedAuths;
    const resolved = findAuthForAccountId(atlassianAuths, accountId);
    return resolved
      ? new AtlassianIntegrationProvider(
          yield* refreshOAuthAuthIfNeeded(resolved.accountId, resolved.auth),
        )
      : yield* t3teamFixtureOrMockProvider(accountId);
  });
}

export function providerForPersistedAuths() {
  return Effect.gen(function* () {
    yield* loadPersistedAuths;
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
  });
}

export function setAtlassianAuth(accountId: string, auth: JiraApiAuth): void {
  atlassianAuths.set(accountId, auth);
  invalidateT3TeamAtlassianAuthDependents();
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
  for (const entry of entries) {
    atlassianAuths.set(entry.accountId, entry.auth);
  }
  invalidateT3TeamAtlassianAuthDependents();
}
