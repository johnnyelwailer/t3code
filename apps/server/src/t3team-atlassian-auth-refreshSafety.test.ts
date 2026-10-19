// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalDate:off globalDateInEffect:off globalTimersInEffect:off preferSchemaOverJson:off - integration test simulates another process writing the secret and holding the lock file.
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { setDeadTokenRecheckDelayMsForTest } from "./t3team-atlassian-auth-deadToken.ts";
import {
  ATLASSIAN_AUTH_LOCK_FILE,
  isAtlassianAuthLockStale,
  tryAcquireAtlassianAuthLock,
} from "./t3team-atlassian-auth-fileLock.ts";
import { loadPersistedAtlassianAuthsPayload } from "./t3team-atlassian-auth-persistence.ts";
import { classifyRejectedSession } from "./t3team-atlassian-auth-rejection.ts";
import { reloadAuthsFromDisk } from "./t3team-atlassian-auth-state.ts";
import { accountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import {
  loadPersistedAuths,
  providerForAccount,
  replaceAtlassianAuths,
  savePersistedAuths,
} from "./t3team-atlassian-auth-store.ts";
import { AtlassianAuthError, jiraCloudApiBaseUrl } from "@t3tools/integrations-atlassian";
import { T3TeamAtlassianError } from "./t3team-atlassian-errors.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  replaceAtlassianAuths([]);
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDeadTokenRecheckDelayMsForTest(0);
});

setDeadTokenRecheckDelayMsForTest(0);

function testLayer(prefix: string) {
  return Layer.mergeAll(
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(NodeServices.layer)),
  );
}

function expiredOAuthAuth(cloudId: string, refreshToken = "old-refresh") {
  return {
    kind: "oauth" as const,
    cloudId,
    siteUrl: `https://${cloudId}.atlassian.net`,
    accessToken: "expired-access-token",
    refreshToken,
    expiresAt: 0,
  };
}

function stubTokenEndpoint(status: number, body: unknown) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: input.toString(), body: JSON.parse(String(init?.body ?? "{}")) });
    return Response.json(body, { status });
  }) as unknown as typeof fetch;
  return calls;
}

function writeSecretAsOtherProcess(entries: ReadonlyArray<Record<string, unknown>>) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* ServerConfig.ServerConfig;
    yield* fileSystem.writeFileString(
      path.join(config.secretsDir, "t3team-atlassian-auths.bin"),
      JSON.stringify({ version: 1, auths: entries }),
    );
  });
}

// --- 3) client configuration vs dead session -------------------------------------------------

it.effect("a missing client secret skips the refresh and never flags the account", () =>
  Effect.gen(function* () {
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "");
    vi.stubEnv("T3WORK_ATLASSIAN_CLIENT_SECRET", "");
    vi.stubEnv("ATLASSIAN_CLIENT_SECRET", "");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    yield* savePersistedAuths;
    const calls = stubTokenEndpoint(200, {});

    const error = yield* providerForAccount("cloud-1").pipe(Effect.flip);

    assert.equal(error.code, "jira_oauth_config");
    assert.deepEqual(calls, []);
    assert.isFalse(accountNeedsReconnect("cloud-1"));
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.equal(persisted?.auths.at(0)?.needsReconnect, undefined);
    const auth = persisted?.auths.at(0)?.auth;
    assert.equal(auth?.kind === "oauth" ? auth.refreshToken : undefined, "old-refresh");
  }).pipe(Effect.provide(testLayer("t3team-atlassian-refresh-nosecret-"))),
);

it.effect("a bare unauthorized_client is a config error, not a dead session", () =>
  Effect.gen(function* () {
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "client-secret");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    yield* savePersistedAuths;
    stubTokenEndpoint(403, { error: "unauthorized_client" });

    const error = yield* providerForAccount("cloud-1").pipe(Effect.flip);

    assert.equal(error.code, "jira_oauth_config");
    assert.isFalse(error.message.includes("client-secret"));
    assert.isFalse(accountNeedsReconnect("cloud-1"));
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.equal(persisted?.auths.at(0)?.needsReconnect, undefined);
  }).pipe(Effect.provide(testLayer("t3team-atlassian-refresh-bareclient-"))),
);

it.effect("invalid_grant flags the account after re-reading the secret", () =>
  Effect.gen(function* () {
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "client-secret");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    yield* savePersistedAuths;
    const calls = stubTokenEndpoint(403, { error: "invalid_grant" });

    const error = yield* providerForAccount("cloud-1").pipe(Effect.flip);

    assert.equal(error.code, "jira_session_expired");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.body.client_secret, "client-secret");
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.equal(persisted?.auths.at(0)?.needsReconnect, true);
  }).pipe(Effect.provide(testLayer("t3team-atlassian-refresh-invalidgrant-"))),
);

it.effect("after invalid_grant, waits and adopts a newer token written meanwhile", () =>
  Effect.gen(function* () {
    setDeadTokenRecheckDelayMsForTest(150);
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "client-secret");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    yield* savePersistedAuths;
    const now = yield* Clock.currentTimeMillis;
    const newer = {
      ...expiredOAuthAuth("cloud-1", "newer-refresh"),
      accessToken: "newer-access",
      expiresAt: now + 3_600_000,
    };
    const config = yield* ServerConfig.ServerConfig;
    const secretPath = NodePath.join(config.secretsDir, "t3team-atlassian-auths.bin");
    globalThis.fetch = vi.fn(async () => {
      // An unlocked writer (older build) stores its rotated token just after our rejection.
      setTimeout(() => {
        void NodeFSP.writeFile(
          secretPath,
          JSON.stringify({ version: 1, auths: [{ accountId: "cloud-1", auth: newer }] }),
        );
      }, 30);
      return Response.json({ error: "invalid_grant" }, { status: 403 });
    }) as unknown as typeof fetch;

    const provider = yield* providerForAccount("cloud-1");

    assert.isDefined(provider);
    assert.isFalse(accountNeedsReconnect("cloud-1"));
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.equal(persisted?.auths.at(0)?.needsReconnect, undefined);
    const auth = persisted?.auths.at(0)?.auth;
    assert.equal(auth?.kind === "oauth" ? auth.refreshToken : undefined, "newer-refresh");
  }).pipe(Effect.provide(testLayer("t3team-atlassian-refresh-adopt-late-"))),
);

it.effect("unauthorized_client with refresh_token is invalid re-reads before flagging", () =>
  Effect.gen(function* () {
    setDeadTokenRecheckDelayMsForTest(150);
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "client-secret");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    yield* savePersistedAuths;
    const now = yield* Clock.currentTimeMillis;
    const newer = {
      ...expiredOAuthAuth("cloud-1", "newer-refresh"),
      accessToken: "newer-access",
      expiresAt: now + 3_600_000,
    };
    const config = yield* ServerConfig.ServerConfig;
    const secretPath = NodePath.join(config.secretsDir, "t3team-atlassian-auths.bin");
    globalThis.fetch = vi.fn(async () => {
      setTimeout(() => {
        void NodeFSP.writeFile(
          secretPath,
          JSON.stringify({ version: 1, auths: [{ accountId: "cloud-1", auth: newer }] }),
        );
      }, 30);
      return Response.json(
        {
          error: "unauthorized_client",
          error_description: "The refresh_token is invalid",
        },
        { status: 403 },
      );
    }) as unknown as typeof fetch;

    const provider = yield* providerForAccount("cloud-1");

    assert.isDefined(provider);
    assert.isFalse(accountNeedsReconnect("cloud-1"));
    const auth = (yield* loadPersistedAtlassianAuthsPayload)?.auths.at(0)?.auth;
    assert.equal(auth?.kind === "oauth" ? auth.refreshToken : undefined, "newer-refresh");
  }).pipe(Effect.provide(testLayer("t3team-atlassian-refresh-unauthorized-adopt-"))),
);

it.effect("a deferred 401 flag is dropped when a newer token is on disk (CAS)", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([
      {
        accountId: "cloud-1",
        auth: { kind: "oauth", cloudId: "cloud-1", accessToken: "stale-access" },
      },
    ]);
    yield* savePersistedAuths;
    const rejection: Effect.Effect<never, AtlassianAuthError | T3TeamAtlassianError> =
      classifyRejectedSession(
        new AtlassianAuthError({
          message: "401",
          path: "/rest/api/3/myself",
          status: 401,
          baseUrl: jiraCloudApiBaseUrl("cloud-1"),
        }),
      );
    yield* Effect.ignore(rejection);
    assert.isTrue(accountNeedsReconnect("cloud-1"));

    // Another process signed in again and stored a fresh token before our reload.
    yield* writeSecretAsOtherProcess([
      { accountId: "cloud-1", auth: { kind: "oauth", cloudId: "cloud-1", accessToken: "fresh" } },
    ]);
    yield* loadPersistedAuths;

    assert.isFalse(accountNeedsReconnect("cloud-1"));
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.equal(persisted?.auths.at(0)?.needsReconnect, undefined);
    const auth = persisted?.auths.at(0)?.auth;
    assert.equal(auth?.kind === "oauth" ? auth.accessToken : undefined, "fresh");
  }).pipe(Effect.provide(testLayer("t3team-atlassian-refresh-cas-"))),
);

// --- 2) cross-process lock --------------------------------------------------------------------

async function tempLockPath() {
  const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3team-atl-lock-"));
  return NodePath.join(dir, ATLASSIAN_AUTH_LOCK_FILE);
}

it.effect("the lock file excludes a second holder until released", () =>
  Effect.promise(async () => {
    const lockPath = await tempLockPath();
    const release = await tryAcquireAtlassianAuthLock(lockPath);
    assert.isNotNull(release);
    assert.isNull(await tryAcquireAtlassianAuthLock(lockPath));
    await release?.();
    const again = await tryAcquireAtlassianAuthLock(lockPath);
    assert.isNotNull(again);
    await again?.();
  }),
);

it.effect("a lock held by a dead process or too old is taken over", () =>
  Effect.promise(async () => {
    const lockPath = await tempLockPath();
    // A pid that can not exist on this host.
    await NodeFSP.writeFile(
      lockPath,
      JSON.stringify({ pid: 2 ** 22 + 12345, host: NodeOS.hostname(), at: Date.now() }),
    );
    assert.isTrue(await isAtlassianAuthLockStale(lockPath));
    const release = await tryAcquireAtlassianAuthLock(lockPath);
    assert.isNotNull(release);
    await release?.();

    // A live owner (this process) is not stale while fresh, but is once older than the limit.
    await NodeFSP.writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, host: NodeOS.hostname(), at: Date.now() }),
    );
    assert.isFalse(await isAtlassianAuthLockStale(lockPath));
    assert.isTrue(await isAtlassianAuthLockStale(lockPath, Date.now() + 120_000));
  }),
);

it.effect("refresh runs under the lock file and releases it afterwards", () =>
  Effect.gen(function* () {
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "client-secret");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    yield* savePersistedAuths;
    const config = yield* ServerConfig.ServerConfig;
    const lockPath = NodePath.join(config.secretsDir, ATLASSIAN_AUTH_LOCK_FILE);
    let lockHeldDuringRefresh = false;
    globalThis.fetch = vi.fn(async () => {
      lockHeldDuringRefresh = await NodeFSP.stat(lockPath).then(
        () => true,
        () => false,
      );
      return Response.json({ access_token: "a2", refresh_token: "r2", expires_in: 3600 });
    }) as unknown as typeof fetch;

    yield* providerForAccount("cloud-1");

    assert.isTrue(lockHeldDuringRefresh);
    const lockLeft = yield* Effect.promise(() =>
      NodeFSP.stat(lockPath).then(
        () => true,
        () => false,
      ),
    );
    assert.isFalse(lockLeft);
    yield* reloadAuthsFromDisk;
  }).pipe(Effect.provide(testLayer("t3team-atlassian-refresh-lockfile-"))),
);

it.effect("a refresh waits for another process holding the lock", () =>
  Effect.gen(function* () {
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_ID", "client-id");
    vi.stubEnv("T3TEAM_ATLASSIAN_CLIENT_SECRET", "client-secret");
    replaceAtlassianAuths([{ accountId: "cloud-1", auth: expiredOAuthAuth("cloud-1") }]);
    yield* savePersistedAuths;
    const config = yield* ServerConfig.ServerConfig;
    const lockPath = NodePath.join(config.secretsDir, ATLASSIAN_AUTH_LOCK_FILE);
    const now = yield* Clock.currentTimeMillis;
    const release = yield* Effect.promise(() => tryAcquireAtlassianAuthLock(lockPath));
    assert.isNotNull(release);
    const calls = stubTokenEndpoint(200, { access_token: "a", refresh_token: "r", expires_in: 1 });

    // The "other process" finishes its refresh, stores a fresh token and releases the lock.
    setTimeout(() => {
      void NodeFSP.writeFile(
        NodePath.join(config.secretsDir, "t3team-atlassian-auths.bin"),
        JSON.stringify({
          version: 1,
          auths: [
            {
              accountId: "cloud-1",
              auth: {
                ...expiredOAuthAuth("cloud-1", "other-refresh"),
                accessToken: "other-access",
                expiresAt: now + 3_600_000,
              },
            },
          ],
        }),
      ).then(() => release?.());
    }, 200);

    yield* providerForAccount("cloud-1");

    // We waited, reloaded, saw the other process's current token and never redeemed ours.
    assert.deepEqual(calls, []);
  }).pipe(Effect.provide(testLayer("t3team-atlassian-refresh-lockwait-"))),
);
