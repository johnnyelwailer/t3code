import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { replaceAtlassianAuths } from "./t3team-atlassian-auth-store.ts";
import { setAccountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
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

const read = (accountId: string) =>
  readDigestViewerTickets({
    project: { account: { id: accountId, provider: "atlassian" }, externalProjectId: "10000" },
    identity: { provider: "atlassian", accountId, externalProjectId: "10000" },
    requestedViewerName: undefined,
  });

const signedIn = (cloudId: string) => ({
  accountId: cloudId,
  auth: { kind: "oauth" as const, cloudId, accessToken: "token" },
});

it.effect("reports an account without Jira credentials as unresolved", () =>
  Effect.gen(function* () {
    const viewer = yield* read("no-auth-cloud");
    assert.isTrue(viewer.unresolved);
    assert.deepEqual(viewer.tickets, []);
  }).pipe(Effect.provide(testLayer("t3team-digest-viewer-no-auth-"))),
);

it.effect("keeps a dead Jira session's typed error so the client can ask to sign in", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([signedIn("dead-cloud")]);
    setAccountNeedsReconnect("dead-cloud", true);

    const error = yield* read("dead-cloud").pipe(Effect.flip);

    assert.instanceOf(error, T3TeamAtlassianError);
    assert.equal(error instanceof T3TeamAtlassianError && error.code, "jira_session_expired");
  }).pipe(Effect.provide(testLayer("t3team-digest-viewer-expired-"))),
);

it.effect("fails the round on a transient lookup failure instead of calling it signed out", () =>
  Effect.gen(function* () {
    replaceAtlassianAuths([signedIn("flaky-cloud")]);
    globalThis.fetch = vi.fn(
      async () => new Response("upstream down", { status: 503 }),
    ) as unknown as typeof fetch;

    const error = yield* read("flaky-cloud").pipe(Effect.flip);

    assert.instanceOf(error, T3TeamAtlassianError);
    assert.notEqual(error instanceof T3TeamAtlassianError && error.code, "jira_session_expired");
  }).pipe(Effect.provide(testLayer("t3team-digest-viewer-transient-"))),
);
