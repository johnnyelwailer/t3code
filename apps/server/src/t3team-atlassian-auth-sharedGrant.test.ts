// @effect-diagnostics preferSchemaOverJson:off globalFetch:off - the test stubs the Atlassian token endpoint.
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { setDeadTokenRecheckDelayMsForTest } from "./t3team-atlassian-auth-deadToken.ts";
import { loadPersistedAtlassianAuthsPayload } from "./t3team-atlassian-auth-persistence.ts";
import { accountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import {
  providerForAccount,
  providerForPersistedAuths,
  replaceAtlassianAuths,
  savePersistedAuths,
} from "./t3team-atlassian-auth-store.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  replaceAtlassianAuths([]);
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

setDeadTokenRecheckDelayMsForTest(0);

function testLayer(prefix: string) {
  return Layer.mergeAll(
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(NodeServices.layer)),
  );
}

/** One Atlassian sign-in, two consented sites: both accounts hold the same grant. */
function signedInTwoSites() {
  const shared = {
    accessToken: "shared-access",
    refreshToken: "shared-refresh",
    expiresAt: 0,
  };
  replaceAtlassianAuths([
    {
      accountId: "cloud-a",
      auth: { kind: "oauth", cloudId: "cloud-a", siteUrl: "https://a.atlassian.net", ...shared },
    },
    {
      accountId: "cloud-b",
      auth: { kind: "oauth", cloudId: "cloud-b", siteUrl: "https://b.atlassian.net", ...shared },
    },
  ]);
}

/** Atlassian's rotating refresh tokens: each token redeems once, a reused one is refused. */
function stubRotatingTokenEndpoint() {
  const redeemed: string[] = [];
  let generation = 0;
  globalThis.fetch = vi.fn(async (_input: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { refresh_token?: string };
    const token = body.refresh_token ?? "";
    if (redeemed.includes(token)) {
      return Response.json(
        { error: "unauthorized_client", error_description: "refresh_token is invalid" },
        { status: 403 },
      );
    }
    redeemed.push(token);
    generation += 1;
    return Response.json({
      access_token: `access-${generation}`,
      refresh_token: `refresh-${generation}`,
      expires_in: 3600,
    });
  }) as unknown as typeof fetch;
  return redeemed;
}

function stubClientEnv() {
  vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
  vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "client-secret");
}

function persistedRefreshTokens() {
  return Effect.map(loadPersistedAtlassianAuthsPayload, (persisted) =>
    Object.fromEntries(
      (persisted?.auths ?? []).map((entry) => [
        entry.accountId,
        {
          refreshToken: entry.auth.kind === "oauth" ? entry.auth.refreshToken : undefined,
          cloudId: entry.auth.kind === "oauth" ? entry.auth.cloudId : undefined,
          needsReconnect: entry.needsReconnect,
        },
      ]),
    ),
  );
}

it.effect("refreshing one site renews the whole grant, so the other site never reuses it", () =>
  Effect.gen(function* () {
    stubClientEnv();
    signedInTwoSites();
    yield* savePersistedAuths;
    const redeemed = stubRotatingTokenEndpoint();

    yield* providerForAccount("cloud-a");
    // Later (outside Atlassian's reuse leeway) the second site is used.
    yield* providerForAccount("cloud-b");

    assert.deepEqual(redeemed, ["shared-refresh"]);
    assert.isFalse(accountNeedsReconnect("cloud-a"));
    assert.isFalse(accountNeedsReconnect("cloud-b"));
    assert.deepEqual(yield* persistedRefreshTokens(), {
      "cloud-a": { refreshToken: "refresh-1", cloudId: "cloud-a", needsReconnect: undefined },
      "cloud-b": { refreshToken: "refresh-1", cloudId: "cloud-b", needsReconnect: undefined },
    });
  }).pipe(Effect.provide(testLayer("t3team-atlassian-shared-grant-sequential-"))),
);

it.effect("one pass over all accounts redeems a shared grant once", () =>
  Effect.gen(function* () {
    stubClientEnv();
    signedInTwoSites();
    yield* savePersistedAuths;
    const redeemed = stubRotatingTokenEndpoint();

    const provider = yield* providerForPersistedAuths();

    assert.isNotNull(provider);
    assert.deepEqual(redeemed, ["shared-refresh"]);
    const tokens = yield* persistedRefreshTokens();
    assert.equal(tokens["cloud-a"]?.refreshToken, "refresh-1");
    assert.equal(tokens["cloud-b"]?.refreshToken, "refresh-1");
  }).pipe(Effect.provide(testLayer("t3team-atlassian-shared-grant-pass-"))),
);

it.effect("a dead shared refresh token flags every site of the grant at once", () =>
  Effect.gen(function* () {
    stubClientEnv();
    signedInTwoSites();
    yield* savePersistedAuths;
    globalThis.fetch = vi.fn(async () =>
      Response.json({ error: "invalid_grant" }, { status: 403 }),
    ) as unknown as typeof fetch;

    const error = yield* providerForAccount("cloud-a").pipe(Effect.flip);

    assert.equal(error.code, "jira_session_expired");
    assert.isTrue(accountNeedsReconnect("cloud-b"));
    const tokens = yield* persistedRefreshTokens();
    assert.equal(tokens["cloud-a"]?.needsReconnect, true);
    assert.equal(tokens["cloud-b"]?.needsReconnect, true);
    // The second site does not hit Atlassian with the dead token again.
    assert.equal(vi.mocked(globalThis.fetch).mock.calls.length, 1);
    yield* providerForAccount("cloud-b").pipe(Effect.flip);
    assert.equal(vi.mocked(globalThis.fetch).mock.calls.length, 1);
  }).pipe(Effect.provide(testLayer("t3team-atlassian-shared-grant-dead-"))),
);

it.effect("accounts from separate sign-ins keep their own refresh tokens", () =>
  Effect.gen(function* () {
    stubClientEnv();
    const now = yield* Clock.currentTimeMillis;
    replaceAtlassianAuths([
      {
        accountId: "cloud-a",
        auth: {
          kind: "oauth",
          cloudId: "cloud-a",
          accessToken: "a",
          refreshToken: "grant-a",
          expiresAt: 0,
        },
      },
      {
        accountId: "cloud-b",
        auth: {
          kind: "oauth",
          cloudId: "cloud-b",
          accessToken: "b",
          refreshToken: "grant-b",
          expiresAt: now + 3_600_000,
        },
      },
    ]);
    yield* savePersistedAuths;
    const redeemed = stubRotatingTokenEndpoint();

    yield* providerForAccount("cloud-a");

    assert.deepEqual(redeemed, ["grant-a"]);
    const tokens = yield* persistedRefreshTokens();
    assert.equal(tokens["cloud-a"]?.refreshToken, "refresh-1");
    assert.equal(tokens["cloud-b"]?.refreshToken, "grant-b");
  }).pipe(Effect.provide(testLayer("t3team-atlassian-shared-grant-separate-"))),
);
