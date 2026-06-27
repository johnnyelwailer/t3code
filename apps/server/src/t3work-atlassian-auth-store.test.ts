import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import {
  providerForAccount,
  providerForPersistedAuths,
  replaceAtlassianAuths,
} from "./t3work-atlassian-auth-store.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  replaceAtlassianAuths([]);
  globalThis.fetch = originalFetch;
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
  }).pipe(Effect.provide(testLayer("t3work-atlassian-auth-replace-"))),
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
  }).pipe(Effect.provide(testLayer("t3work-atlassian-auth-site-alias-"))),
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
  }).pipe(Effect.provide(testLayer("t3work-atlassian-auth-stale-"))),
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
  }).pipe(Effect.provide(testLayer("t3work-atlassian-auth-expired-"))),
);
