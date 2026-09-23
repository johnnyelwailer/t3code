import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { loadPersistedAtlassianAuthsPayload } from "./t3team-atlassian-auth-persistence.ts";
import {
  ATLASSIAN_RECONNECT_REQUIRED_MESSAGE,
  setAccountNeedsReconnect,
} from "./t3team-atlassian-auth-staleToken.ts";
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
  delete process.env.T3TEAM_ATLASSIAN_CLIENT_ID;
  vi.restoreAllMocks();
});

function testLayer(prefix: string) {
  return Layer.mergeAll(
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(NodeServices.layer)),
  );
}

it.effect("replaces old Atlassian auths instead of merging stale records", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([
      {
        accountId: "old-cloud",
        auth: {
          kind: "oauth",
          cloudId: "old-cloud",
          siteUrl: "https://old.atlassian.net",
          accessToken: "old-token",
        },
      },
    ]);
    replaceAtlassianAuths([
      {
        accountId: "new-cloud",
        auth: {
          kind: "oauth",
          cloudId: "new-cloud",
          siteUrl: "https://new.atlassian.net",
          accessToken: "new-token",
        },
      },
    ]);

    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      requestedUrls.push(input.toString());
      return Response.json({ accountId: "user-1", displayName: "Test User" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = yield* providerForPersistedAuths();
    const accounts = yield* Effect.tryPromise(
      () => provider?.listAccounts() ?? Promise.resolve([]),
    );

    assert.deepEqual(requestedUrls, [
      "https://api.atlassian.com/ex/jira/new-cloud/rest/api/3/myself",
    ]);
    assert.deepEqual(
      accounts.map((account) => account.id),
      ["new-cloud"],
    );
  }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-replace-"))),
);

it.effect("resolves persisted OAuth auths by Atlassian site URL aliases", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([
      {
        accountId: "cloud-1",
        auth: {
          kind: "oauth",
          cloudId: "cloud-1",
          siteUrl: "https://example.atlassian.net",
          accessToken: "token-1",
        },
      },
    ]);

    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      requestedUrls.push(input.toString());
      return Response.json({ accountId: "user-1", displayName: "Test User" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = yield* providerForAccount("https://example.atlassian.net/");
    const accounts = yield* Effect.tryPromise(() => provider.listAccounts());

    assert.deepEqual(requestedUrls, [
      "https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/myself",
    ]);
    assert.deepEqual(
      accounts.map((account) => account.id),
      ["cloud-1"],
    );
  }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-site-alias-"))),
);

it.effect("ignores stale expired OAuth records when a current account remains", () =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    replaceAtlassianAuths([
      {
        accountId: "old-cloud",
        auth: {
          kind: "oauth",
          cloudId: "old-cloud",
          siteUrl: "https://old.atlassian.net",
          accessToken: "old-token",
          expiresAt: 0,
        },
      },
      {
        accountId: "new-cloud",
        auth: {
          kind: "oauth",
          cloudId: "new-cloud",
          siteUrl: "https://new.atlassian.net",
          accessToken: "new-token",
          refreshToken: "new-refresh-token",
          expiresAt: now + 3_600_000,
        },
      },
    ]);

    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      requestedUrls.push(input.toString());
      return Response.json({ accountId: "user-1", displayName: "Test User" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = yield* providerForPersistedAuths();
    const accounts = yield* Effect.tryPromise(
      () => provider?.listAccounts() ?? Promise.resolve([]),
    );

    assert.deepEqual(requestedUrls, [
      "https://api.atlassian.com/ex/jira/new-cloud/rest/api/3/myself",
    ]);
    assert.deepEqual(
      accounts.map((account) => account.id),
      ["new-cloud"],
    );
  }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-stale-"))),
);

it.effect("explains expired OAuth records that cannot be refreshed", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([
      {
        accountId: "old-cloud",
        auth: {
          kind: "oauth",
          cloudId: "old-cloud",
          siteUrl: "https://old.atlassian.net",
          accessToken: "old-token",
          expiresAt: 0,
        },
      },
    ]);

    const error = yield* providerForPersistedAuths().pipe(Effect.flip);

    assert.equal(
      error.message,
      "Atlassian OAuth token expired and no refresh token is stored. Reconnect Atlassian to grant offline access.",
    );
  }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-expired-"))),
);

it.effect(
  "clears the stored credentials and reports a typed session-expired error when the refresh token is dead",
  () =>
    Effect.gen(function* () {
      replaceAtlassianAuths([
        {
          accountId: "dead-cloud",
          auth: {
            kind: "oauth",
            cloudId: "dead-cloud",
            siteUrl: "https://dead.atlassian.net",
            accessToken: "stale-token",
            refreshToken: "dead-refresh-token",
            expiresAt: 0,
          },
        },
      ]);
      process.env.T3TEAM_ATLASSIAN_CLIENT_ID = "test-client";

      const refreshCalls: string[] = [];
      globalThis.fetch = vi.fn(async (input: string | URL) => {
        refreshCalls.push(input.toString());
        return Response.json(
          { error: "unauthorized_client", error_description: "refresh_token is invalid" },
          { status: 403 },
        );
      }) as unknown as typeof fetch;

      const error = yield* providerForAccount("dead-cloud").pipe(Effect.flip);

      // The clean typed error — never the upstream token JSON.
      assert.equal(error.code, "jira_session_expired");
      assert.equal(error.message, "Your Jira session expired. Sign in again.");
      assert.isFalse(error.message.includes("refresh_token"));
      assert.deepEqual(refreshCalls, ["https://auth.atlassian.com/oauth/token"]);

      // The dead credentials are cleared: the account is now "signed out" (mock provider)
      // and no second refresh attempt may loop on the same token.
      const provider = yield* providerForAccount("dead-cloud");
      assert.equal(provider.constructor.name, "MockIntegrationProvider");
      assert.deepEqual(refreshCalls, ["https://auth.atlassian.com/oauth/token"]);
    }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-dead-refresh-"))),
);

function expiredOAuthAuth(cloudId: string) {
  return {
    kind: "oauth" as const,
    cloudId,
    siteUrl: `https://${cloudId}.atlassian.net`,
    accessToken: "expired-access-token",
    refreshToken: "rotated-away-refresh-token",
    expiresAt: 0,
  };
}

function stubTokenEndpoint(status: number, body: string) {
  const requestedUrls: string[] = [];
  globalThis.fetch = vi.fn(async (input: string | URL) => {
    requestedUrls.push(input.toString());
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return requestedUrls;
}

it.effect(
  "fails fast with the actionable message when the account is flagged needs-reconnect",
  () =>
    Effect.gen(function* () {
      vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
      replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
      // Flagged by a rotated-away refresh (or rehydrated from the persisted secret).
      setAccountNeedsReconnect("cloud-1", true);
      const requestedUrls = stubTokenEndpoint(
        200,
        '{"access_token":"fresh","refresh_token":"fresh-r","expires_in":300}',
      );

      const first = yield* providerForAccount("cloud-1").pipe(Effect.flip);
      const second = yield* providerForAccount("cloud-1").pipe(Effect.flip);

      assert.equal(first.message, ATLASSIAN_RECONNECT_REQUIRED_MESSAGE);
      assert.equal(second.message, ATLASSIAN_RECONNECT_REQUIRED_MESSAGE);
      // The dead token is never redeemed again: the flag short-circuits before the token endpoint.
      assert.deepEqual(requestedUrls, []);
      const persisted = yield* loadPersistedAtlassianAuthsPayload;
      yield* savePersistedAuths;
      const afterSave = yield* loadPersistedAtlassianAuthsPayload;
      assert.deepEqual(
        afterSave?.auths.map((entry) => [entry.accountId, entry.needsReconnect]),
        [["cloud-1", true]],
      );
      assert.equal(persisted, null);
    }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-rotated-"))),
);

it.effect("keeps the raw refresh error for failures that are not a dead refresh token", () =>
  Effect.gen(function* () {
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    const requestedUrls = stubTokenEndpoint(500, '{"error":"server_error"}');

    const first = yield* providerForAccount("cloud-1").pipe(Effect.flip);
    const second = yield* providerForAccount("cloud-1").pipe(Effect.flip);

    assert.equal(first.message, 'Token refresh failed (500): {"error":"server_error"}');
    assert.equal(second.message, first.message);
    // Not flagged, so the next call retries the refresh as before.
    assert.equal(requestedUrls.length, 2);
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.equal(persisted, null);
  }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-refresh-5xx-"))),
);

it.effect("reconnecting clears the needs-reconnect flag", () =>
  Effect.gen(function* () {
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    setAccountNeedsReconnect("cloud-1", true);

    // Same steps the OAuth connect route performs after a successful sign-in.
    replaceAtlassianAuths([
      {
        accountId: "cloud-1",
        auth: { kind: "oauth", cloudId: "cloud-1", accessToken: "fresh-token" },
      },
    ]);
    yield* savePersistedAuths;
    globalThis.fetch = vi.fn(async () =>
      Response.json({ accountId: "user-1", displayName: "Test User" }),
    ) as unknown as typeof fetch;

    const provider = yield* providerForAccount("cloud-1");
    const accounts = yield* Effect.tryPromise(() => provider.listAccounts());
    assert.deepEqual(
      accounts.map((account) => account.id),
      ["cloud-1"],
    );
    // The persisted payload no longer carries the flag.
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.equal(persisted?.auths.at(0)?.needsReconnect, undefined);
  }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-reconnect-clears-"))),
);
