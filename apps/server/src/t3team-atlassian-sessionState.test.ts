import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { AtlassianAuthError, jiraCloudApiBaseUrl } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { readAtlassianAccountStatuses } from "./t3team-atlassian-accountStatus.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";
import { disconnectAtlassianAccount } from "./t3team-atlassian-auth-disconnect.ts";
import { loadPersistedAtlassianAuthsPayload } from "./t3team-atlassian-auth-persistence.ts";
import {
  accountNeedsReconnect,
  setAccountNeedsReconnect,
} from "./t3team-atlassian-auth-staleToken.ts";
import {
  loadPersistedAuths,
  replaceAtlassianAuths,
  savePersistedAuths,
} from "./t3team-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import { resolveT3TeamAtlassianViewerAccountIdStrict } from "./t3team-atlassian-viewer-identity.ts";
import { readDigestJiraHealth } from "./t3team-myworkDigestJiraHealth.ts";
import { readDigestViewerTickets } from "./t3team-myworkDigestViewer.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  replaceAtlassianAuths([]);
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function testLayer(prefix: string) {
  return Layer.mergeAll(
    SqlitePersistenceMemory,
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(NodeServices.layer)),
  );
}

const signedIn = (cloudId: string) => ({
  accountId: cloudId,
  auth: {
    kind: "oauth" as const,
    cloudId,
    siteUrl: `https://${cloudId}.atlassian.net`,
    accessToken: "token",
  },
});

const refusedCall = (cloudId: string, init: { status: number; missingScope?: boolean }) =>
  tryAtlassianPromise(
    () =>
      Promise.reject(
        new AtlassianAuthError({
          message: "Authentication failed",
          path: "/rest/api/3/search",
          baseUrl: jiraCloudApiBaseUrl(cloudId),
          ...init,
        }),
      ),
    "Failed to load issues.",
  );

it.effect("a 401 from an ordinary Jira call flags the account and fails with the typed error", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([signedIn("cloud-1"), signedIn("cloud-2")]);
    yield* savePersistedAuths;

    const error = yield* refusedCall("cloud-1", { status: 401 }).pipe(Effect.flip);

    assert.equal(error.code, "jira_session_expired");
    assert.isTrue(accountNeedsReconnect("cloud-1"));
    assert.isFalse(accountNeedsReconnect("cloud-2"));
    yield* loadPersistedAuths;
    assert.isTrue(accountNeedsReconnect("cloud-1"));
    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.deepEqual(
      persisted?.auths.map((entry) => [entry.accountId, entry.needsReconnect]),
      [
        ["cloud-1", true],
        ["cloud-2", undefined],
      ],
    );
  }).pipe(Effect.provide(testLayer("t3team-session-state-rejected-"))),
);

it.effect("a 403 or a missing grant is not a dead session", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([signedIn("cloud-1")]);
    yield* savePersistedAuths;

    const forbidden = yield* refusedCall("cloud-1", { status: 403 }).pipe(Effect.flip);
    const scope = yield* refusedCall("cloud-1", { status: 401, missingScope: true }).pipe(
      Effect.flip,
    );

    assert.equal(forbidden.code, undefined);
    assert.equal(scope.code, undefined);
    assert.isFalse(accountNeedsReconnect("cloud-1"));
  }).pipe(Effect.provide(testLayer("t3team-session-state-not-dead-"))),
);

it.effect("a 401 for a credential no stored account uses keeps its own error", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([signedIn("cloud-1")]);
    yield* savePersistedAuths;

    const error = yield* refusedCall("someone-else", { status: 401 }).pipe(Effect.flip);

    assert.equal(error.code, undefined);
    assert.isFalse(accountNeedsReconnect("cloud-1"));
  }).pipe(Effect.provide(testLayer("t3team-session-state-unmatched-"))),
);

it.effect("lists every stored account with its session state, dead ones included", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([signedIn("cloud-1"), signedIn("cloud-2")]);
    setAccountNeedsReconnect("cloud-2", true);

    const accounts = yield* readAtlassianAccountStatuses([
      {
        id: "cloud-1",
        provider: "atlassian",
        label: "Philip",
        accountUrl: "https://cloud-1.atlassian.net",
      },
    ]);

    assert.deepEqual(
      accounts.map((account) => [
        account.id,
        account.label,
        account.status,
        account.needsReconnect,
      ]),
      [
        ["cloud-1", "Philip", "connected", false],
        ["cloud-2", "cloud-2.atlassian.net", "needs-reconnect", true],
      ],
    );
  }).pipe(Effect.provide(testLayer("t3team-session-state-accounts-"))),
);

it.effect("disconnect forgets one account, persists that, and reports an unknown one", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([signedIn("cloud-1"), signedIn("cloud-2")]);
    yield* savePersistedAuths;
    setAccountNeedsReconnect("cloud-1", true);

    assert.isTrue(yield* disconnectAtlassianAccount("cloud-1"));
    assert.isFalse(yield* disconnectAtlassianAccount("cloud-1"));

    const persisted = yield* loadPersistedAtlassianAuthsPayload;
    assert.deepEqual(
      persisted?.auths.map((entry) => entry.accountId),
      ["cloud-2"],
    );
    assert.isFalse(accountNeedsReconnect("cloud-1"));
  }).pipe(Effect.provide(testLayer("t3team-session-state-disconnect-"))),
);

it.effect("a flagged session with a remembered viewer still reads the mirror", () =>
  Effect.gen(function* () {
    yield* ensureBacklogCacheTables();
    replaceAtlassianAuths([signedIn("cloud-1")]);
    globalThis.fetch = vi.fn(async () =>
      Response.json({ accountId: "viewer-1", displayName: "Philip" }),
    ) as unknown as typeof fetch;
    yield* resolveT3TeamAtlassianViewerAccountIdStrict({ id: "cloud-1", provider: "atlassian" });
    setAccountNeedsReconnect("cloud-1", true);

    const viewer = yield* readDigestViewerTickets({
      project: { account: { id: "cloud-1", provider: "atlassian" }, externalProjectId: "10000" },
      identity: { provider: "atlassian", accountId: "cloud-1", externalProjectId: "10000" },
      requestedViewerName: undefined,
    });

    assert.isFalse(viewer.unresolved);
  }).pipe(Effect.provide(testLayer("t3team-session-state-viewer-"))),
);

it.effect("the digest marks a project whose session is dead", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([signedIn("cloud-1"), signedIn("cloud-2")]);
    setAccountNeedsReconnect("cloud-2", true);
    const health = (accountId: string) =>
      readDigestJiraHealth({
        account: { id: accountId, provider: "atlassian" },
        externalProjectId: "10000",
      });

    assert.equal((yield* health("cloud-1")).jiraAuth, "ok");
    assert.equal((yield* health("cloud-2")).jiraAuth, "needs-reconnect");
  }).pipe(Effect.provide(testLayer("t3team-session-state-health-"))),
);
