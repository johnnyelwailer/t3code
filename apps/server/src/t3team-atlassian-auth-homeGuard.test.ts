// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off - the test writes a copied secret file directly.
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { setDeadTokenRecheckDelayMsForTest } from "./t3team-atlassian-auth-deadToken.ts";
import {
  atlassianHomeIdForSecretsDir,
  currentAtlassianHomeId,
} from "./t3team-atlassian-auth-homeGuard.ts";
import { loadPersistedAtlassianAuthsPayload } from "./t3team-atlassian-auth-persistence.ts";
import { accountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import {
  providerForAccount,
  replaceAtlassianAuths,
  savePersistedAuths,
} from "./t3team-atlassian-auth-store.ts";

const originalFetch = globalThis.fetch;
setDeadTokenRecheckDelayMsForTest(0);

afterEach(() => {
  replaceAtlassianAuths([]);
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const layer = (prefix: string) =>
  Layer.mergeAll(
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(NodeServices.layer)),
  );

const FOREIGN = atlassianHomeIdForSecretsDir("/some/other/installation/secrets");

const expired = (refreshToken: string) => ({
  kind: "oauth" as const,
  cloudId: "cloud-1",
  siteUrl: "https://cloud-1.atlassian.net",
  accessToken: "expired-access-token",
  refreshToken,
  expiresAt: 0,
});

function stubTokenEndpoint() {
  const calls: Array<Record<string, unknown>> = [];
  globalThis.fetch = vi.fn(async (_input: string | URL, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")));
    return Response.json(
      { access_token: "new-access", refresh_token: "rotated-refresh", expires_in: 3600 },
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return calls;
}

/** Write the secret the way a copied profile carries it. */
function writeSecret(homeId: string | undefined) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* ServerConfig.ServerConfig;
    yield* fs.makeDirectory(config.secretsDir, { recursive: true });
    yield* fs.writeFileString(
      path.join(config.secretsDir, "t3team-atlassian-auths.bin"),
      JSON.stringify({
        version: 1,
        ...(homeId ? { homeId } : {}),
        auths: [{ accountId: "cloud-1", auth: expired("copied-refresh") }],
      }),
    );
  });
}

function stubClient() {
  vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
  vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "client-secret");
}

it("the home id is a stable path hash, never the path itself", () => {
  const a = atlassianHomeIdForSecretsDir("/home/a/.t3/secrets");
  assert.equal(a, atlassianHomeIdForSecretsDir("/home/a/.t3/secrets"));
  assert.notEqual(a, FOREIGN);
  assert.isFalse(a.includes("home"));
});

it.effect("a secret copied from another installation never redeems the refresh token", () =>
  Effect.gen(function* () {
    stubClient();
    const calls = stubTokenEndpoint();
    yield* writeSecret(FOREIGN);

    const error = yield* providerForAccount("cloud-1").pipe(Effect.flip);

    assert.equal(error.code, "jira_oauth_config");
    assert.deepEqual(calls, [], "the shared single-use refresh token must not be rotated");
    assert.isFalse(accountNeedsReconnect("cloud-1"));
    const auth = (yield* loadPersistedAtlassianAuthsPayload)?.auths.at(0)?.auth;
    assert.equal(auth?.kind === "oauth" ? auth.refreshToken : undefined, "copied-refresh");
  }).pipe(Effect.provide(layer("t3team-atlassian-home-copy-"))),
);

it.effect("saving on a copy keeps the foreign id, so the copy can not adopt the secret", () =>
  Effect.gen(function* () {
    stubClient();
    const calls = stubTokenEndpoint();
    yield* writeSecret(FOREIGN);
    yield* providerForAccount("cloud-1").pipe(Effect.flip);
    yield* savePersistedAuths;

    assert.equal((yield* loadPersistedAtlassianAuthsPayload)?.homeId, FOREIGN);
    yield* providerForAccount("cloud-1").pipe(Effect.flip);
    assert.deepEqual(calls, []);
  }).pipe(Effect.provide(layer("t3team-atlassian-home-launder-"))),
);

it.effect("a legacy secret without an id is adopted, refreshed and stamped with this home", () =>
  Effect.gen(function* () {
    stubClient();
    const calls = stubTokenEndpoint();
    yield* writeSecret(undefined);

    yield* providerForAccount("cloud-1");

    assert.equal(calls.length, 1);
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.equal(persisted?.homeId, yield* currentAtlassianHomeId);
    const auth = persisted?.auths.at(0)?.auth;
    assert.equal(auth?.kind === "oauth" ? auth.refreshToken : undefined, "rotated-refresh");
  }).pipe(Effect.provide(layer("t3team-atlassian-home-legacy-"))),
);

it.effect("signing in on the copy claims the secret for that installation", () =>
  Effect.gen(function* () {
    stubClient();
    const calls = stubTokenEndpoint();
    yield* writeSecret(FOREIGN);
    yield* providerForAccount("cloud-1").pipe(Effect.flip);

    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expired("fresh-sign-in") }]);
    yield* savePersistedAuths;
    yield* providerForAccount("cloud-1");

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.refresh_token, "fresh-sign-in");
    assert.equal(
      (yield* loadPersistedAtlassianAuthsPayload)?.homeId,
      yield* currentAtlassianHomeId,
    );
  }).pipe(Effect.provide(layer("t3team-atlassian-home-claim-"))),
);
