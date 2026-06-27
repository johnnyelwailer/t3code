import {
  AtlassianIntegrationProvider,
  type AtlassianAccessibleResource,
  type JiraApiAuth,
  type TokenExchangeResult,
  refreshAccessToken,
} from "@t3tools/integrations-atlassian";
import { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { T3workAtlassianError, tryAtlassianPromise } from "./t3work-atlassian-http.ts";
import {
  loadPersistedAtlassianAuthsPayload,
  type PersistedAtlassianAuths,
  savePersistedAtlassianAuthsPayload,
} from "./t3work-atlassian-auth-persistence.ts";

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

const mockProvider = new MockIntegrationProvider();
const atlassianAuths = new Map<string, JiraApiAuth>();
const OAUTH_REFRESH_SKEW_MS = 60_000;

function normalizeAtlassianSiteUrl(value: string): string | null {
  try {
    const trimmed = value.trim();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}${
      url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")
    }`;
  } catch {
    return null;
  }
}

function authSiteUrl(auth: JiraApiAuth): string | undefined {
  if (auth.kind === "basic") {
    return auth.siteUrl;
  }
  return auth.siteUrl;
}

function findAuthForAccountId(
  accountId: string,
): { readonly accountId: string; readonly auth: JiraApiAuth } | undefined {
  const exact = atlassianAuths.get(accountId);
  if (exact) {
    return { accountId, auth: exact };
  }

  const normalizedAccountId = normalizeAtlassianSiteUrl(accountId);
  if (!normalizedAccountId) {
    return undefined;
  }

  for (const [storedAccountId, auth] of atlassianAuths) {
    const storedAccountUrl = normalizeAtlassianSiteUrl(storedAccountId);
    const storedAuthUrl = authSiteUrl(auth) ? normalizeAtlassianSiteUrl(authSiteUrl(auth)!) : null;
    if (storedAccountUrl === normalizedAccountId || storedAuthUrl === normalizedAccountId) {
      return { accountId: storedAccountId, auth };
    }
  }
  return undefined;
}

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

export const savePersistedAuths = Effect.suspend(() =>
  savePersistedAtlassianAuthsPayload(persistedAuthsPayload()),
);

function missingRefreshTokenError() {
  return new T3workAtlassianError({
    message:
      "Atlassian OAuth token expired and no refresh token is stored. Reconnect Atlassian to grant offline access.",
  });
}

function atlassianOAuthClientConfig(): { clientId: string; clientSecret?: string } {
  const clientId =
    process.env.T3WORK_ATLASSIAN_CLIENT_ID?.trim() ??
    process.env.VITE_ATLASSIAN_CLIENT_ID?.trim() ??
    "";
  const clientSecret = process.env.T3WORK_ATLASSIAN_CLIENT_SECRET?.trim();
  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
  };
}

function refreshOAuthAuthIfNeeded(accountId: string, auth: JiraApiAuth) {
  return Effect.gen(function* () {
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
}

export function providerForAccount(accountId: string) {
  return Effect.gen(function* () {
    yield* loadPersistedAuths;
    const resolved = findAuthForAccountId(accountId);
    return resolved
      ? new AtlassianIntegrationProvider(
          yield* refreshOAuthAuthIfNeeded(resolved.accountId, resolved.auth),
        )
      : mockProvider;
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
}

export function replaceAtlassianAuths(
  entries: ReadonlyArray<{ readonly accountId: string; readonly auth: JiraApiAuth }>,
): void {
  atlassianAuths.clear();
  for (const entry of entries) {
    atlassianAuths.set(entry.accountId, entry.auth);
  }
}
