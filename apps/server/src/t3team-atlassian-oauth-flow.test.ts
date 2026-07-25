import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { afterEach, beforeEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { replaceAtlassianAuths } from "./t3team-atlassian-auth-store.ts";
import {
  beginAtlassianOAuthFlow,
  completeAtlassianOAuthFlow,
  resolveAtlassianOAuthAuthorizeUrl,
} from "./t3team-atlassian-oauth-flow.ts";
import {
  ATLASSIAN_OAUTH_FLOW_TTL_MS,
  consumePendingAtlassianOAuthFlow,
  pendingAtlassianOAuthFlowCount,
  readPendingAtlassianOAuthFlow,
  resetPendingAtlassianOAuthFlows,
} from "./t3team-atlassian-oauth-flowStore.ts";

const REDIRECT_URI = "http://localhost:5736/oauth/callback";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function testLayer(prefix: string) {
  return Layer.mergeAll(
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(NodeServices.layer)),
  );
}

beforeEach(() => {
  process.env.T3TEAM_ATLASSIAN_CLIENT_ID = "test-client-id";
  process.env.T3TEAM_ATLASSIAN_CLIENT_SECRET = "test-client-secret";
  // No test here may talk to Atlassian. Tests that expect a call replace this with their own stub.
  globalThis.fetch = vi.fn(async (input: string | URL) => {
    throw new Error(`Unexpected network call in test: ${input.toString()}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  resetPendingAtlassianOAuthFlows();
  replaceAtlassianAuths([]);
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

it.effect("issues an authorize URL bound to a fresh state and keeps the verifier server-side", () =>
  Effect.gen(function* () {
    const begun = yield* beginAtlassianOAuthFlow({ redirectUri: REDIRECT_URI });

    const authorizeUrl = new URL(begun.authorizeUrl);
    assert.equal(authorizeUrl.origin, "https://auth.atlassian.com");
    assert.equal(authorizeUrl.pathname, "/authorize");
    assert.equal(authorizeUrl.searchParams.get("state"), begun.state);
    assert.equal(authorizeUrl.searchParams.get("redirect_uri"), REDIRECT_URI);
    assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(begun.beginPath, `/api/t3team/atlassian/oauth/begin/${begun.state}`);

    // The challenge travels; the verifier that redeems it must not.
    const stored = readPendingAtlassianOAuthFlow(begun.state, 0);
    assert.isDefined(stored);
    assert.isFalse(begun.authorizeUrl.includes(stored!.codeVerifier));
    assert.notInclude(Object.values(begun).join(" "), stored!.codeVerifier);
  }),
);

it.effect("issues an unguessable, distinct state per flow", () =>
  Effect.gen(function* () {
    const first = yield* beginAtlassianOAuthFlow({ redirectUri: REDIRECT_URI });
    const second = yield* beginAtlassianOAuthFlow({ redirectUri: REDIRECT_URI });

    assert.notEqual(first.state, second.state);
    assert.match(first.state, /^[0-9a-f]{32}$/);
    assert.equal(pendingAtlassianOAuthFlowCount(), 2);
  }),
);

it.effect("refuses to begin without a redirect URI", () =>
  Effect.gen(function* () {
    const error = yield* beginAtlassianOAuthFlow({ redirectUri: "   " }).pipe(Effect.flip);

    assert.equal(error.message, "Atlassian OAuth redirect URI is missing from the request.");
    assert.equal(pendingAtlassianOAuthFlowCount(), 0);
  }),
);

it.effect("explains an unconfigured client instead of issuing a useless link", () =>
  Effect.gen(function* () {
    delete process.env.T3TEAM_ATLASSIAN_CLIENT_ID;
    delete process.env.T3WORK_ATLASSIAN_CLIENT_ID;
    delete process.env.VITE_ATLASSIAN_CLIENT_ID;
    delete process.env.ATLASSIAN_CLIENT_ID;

    const error = yield* beginAtlassianOAuthFlow({ redirectUri: REDIRECT_URI }).pipe(Effect.flip);

    assert.include(error.message, "Atlassian OAuth is not configured.");
  }),
);

it.effect("redirects only to the authorize URL it stored, and only while the state lives", () =>
  Effect.gen(function* () {
    const begun = yield* beginAtlassianOAuthFlow({ redirectUri: REDIRECT_URI });

    assert.equal(yield* resolveAtlassianOAuthAuthorizeUrl(begun.state), begun.authorizeUrl);
    assert.isUndefined(yield* resolveAtlassianOAuthAuthorizeUrl("not-a-state"));
    assert.isUndefined(yield* resolveAtlassianOAuthAuthorizeUrl(""));

    consumePendingAtlassianOAuthFlow(begun.state, 0);
    assert.isUndefined(yield* resolveAtlassianOAuthAuthorizeUrl(begun.state));
  }),
);

it.effect("reports an unknown state as a flow outcome, not a server failure", () =>
  Effect.gen(function* () {
    const result = yield* completeAtlassianOAuthFlow({ state: "deadbeef", code: "code-1" });

    assert.deepEqual(result, { status: "unknown_state" });
  }).pipe(Effect.provide(testLayer("t3team-atlassian-oauth-flow-unknown-"))),
);

it.effect("treats an expired state as unknown", () =>
  Effect.gen(function* () {
    const begun = yield* beginAtlassianOAuthFlow({ redirectUri: REDIRECT_URI });

    yield* TestClock.adjust(Duration.millis(ATLASSIAN_OAUTH_FLOW_TTL_MS));
    const result = yield* completeAtlassianOAuthFlow({ state: begun.state, code: "code-1" });

    // Nothing was attempted against Atlassian: the guard fetch in `beforeEach` would have thrown.
    assert.deepEqual(result, { status: "unknown_state" });
    assert.isUndefined(yield* resolveAtlassianOAuthAuthorizeUrl(begun.state));
  }).pipe(Effect.provide(testLayer("t3team-atlassian-oauth-flow-expired-"))),
);

it.effect("keeps the state usable when the token exchange fails, without extending its life", () =>
  Effect.gen(function* () {
    const begun = yield* beginAtlassianOAuthFlow({ redirectUri: REDIRECT_URI });
    const createdAtMs = readPendingAtlassianOAuthFlow(begun.state, 0)!.createdAtMs;
    globalThis.fetch = vi.fn(
      async () => new Response("bad code", { status: 400 }),
    ) as unknown as typeof fetch;

    const error = yield* completeAtlassianOAuthFlow({
      state: begun.state,
      code: "wrong-code",
    }).pipe(Effect.flip);

    assert.include(error.message, "Token exchange failed (400)");
    const restored = readPendingAtlassianOAuthFlow(begun.state, 0);
    assert.isDefined(restored);
    assert.equal(restored!.createdAtMs, createdAtMs);
  }).pipe(Effect.provide(testLayer("t3team-atlassian-oauth-flow-retry-"))),
);

it.effect("spends the state on success and persists the account through the shared path", () =>
  Effect.gen(function* () {
    const begun = yield* beginAtlassianOAuthFlow({ redirectUri: REDIRECT_URI });
    const verifier = readPendingAtlassianOAuthFlow(begun.state, 0)!.codeVerifier;
    const tokenRequestBodies: string[] = [];

    globalThis.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === "https://auth.atlassian.com/oauth/token") {
        tokenRequestBodies.push(String(init?.body));
        return Response.json({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
        });
      }
      if (url === "https://api.atlassian.com/oauth/token/accessible-resources") {
        return Response.json([
          { id: "cloud-1", url: "https://example.atlassian.net", name: "Example", scopes: [] },
        ]);
      }
      return Response.json({ accountId: "user-1", displayName: "Test User" });
    }) as unknown as typeof fetch;

    const result = yield* completeAtlassianOAuthFlow({ state: begun.state, code: "code-1" });

    assert.equal(result.status, "completed");
    assert.deepEqual(
      result.status === "completed" ? result.accounts.map((account) => account.id) : [],
      ["cloud-1"],
    );
    // The exchange used the stored verifier and the confidential client secret.
    const tokenBody = tokenRequestBodies[0] ?? "";
    assert.include(tokenBody, `"code_verifier":"${verifier}"`);
    assert.include(tokenBody, `"client_secret":"test-client-secret"`);
    assert.include(tokenBody, `"redirect_uri":"${REDIRECT_URI}"`);
    // Replay of the same state now finds nothing.
    assert.deepEqual(yield* completeAtlassianOAuthFlow({ state: begun.state, code: "code-1" }), {
      status: "unknown_state",
    });
  }).pipe(Effect.provide(testLayer("t3team-atlassian-oauth-flow-complete-"))),
);
