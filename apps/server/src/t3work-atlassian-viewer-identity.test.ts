import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { replaceAtlassianAuths } from "./t3work-atlassian-auth-store.ts";
import { resolveT3workAtlassianViewerAccountId } from "./t3work-atlassian-viewer-identity.ts";

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

const oauthAuth = (cloudId: string, siteUrl: string, accessToken: string) => ({
  accountId: cloudId,
  auth: {
    kind: "oauth" as const,
    cloudId,
    siteUrl,
    accessToken,
  },
});

it.effect(
  "reconnecting (replaceAtlassianAuths) invalidates the cached viewer accountId for a stale user",
  () =>
    Effect.gen(function* () {
      replaceAtlassianAuths([oauthAuth("cloud-1", "https://example.atlassian.net", "token-old-user")]);

      const requestedUrls: string[] = [];
      const fetchMock = vi.fn(async (input: string | URL) => {
        requestedUrls.push(input.toString());
        return Response.json({ accountId: "old-user", displayName: "Old User" });
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const account = { id: "cloud-1", provider: "atlassian" } as const;
      const first = yield* resolveT3workAtlassianViewerAccountId(account);
      assert.strictEqual(first, "old-user");
      assert.strictEqual(requestedUrls.length, 1, "first resolution hits the network");

      // Same account.id resolves from cache without a second network call.
      const cached = yield* resolveT3workAtlassianViewerAccountId(account);
      assert.strictEqual(cached, "old-user");
      assert.strictEqual(requestedUrls.length, 1, "cached resolution does not refetch");

      // A reconnect on the same account id (different Atlassian user) must
      // invalidate the cache so the next resolution re-resolves instead of
      // silently serving the previous person's viewer identity.
      replaceAtlassianAuths([oauthAuth("cloud-1", "https://example.atlassian.net", "token-new-user")]);
      fetchMock.mockImplementation(async (input: string | URL) => {
        requestedUrls.push(input.toString());
        return Response.json({ accountId: "new-user", displayName: "New User" });
      });

      const afterReconnect = yield* resolveT3workAtlassianViewerAccountId(account);
      assert.strictEqual(afterReconnect, "new-user");
      assert.strictEqual(requestedUrls.length, 2, "reconnect forces a fresh resolution");
    }).pipe(Effect.provide(testLayer("t3work-atlassian-viewer-identity-invalidate-"))),
);

it.effect(
  "logs a warning (with account id and provider) and falls back to undefined when resolving the viewer fails",
  () => {
    const entries: unknown[] = [];
    const logger = Logger.make(({ message }) => {
      entries.push(message);
    });

    return Effect.gen(function* () {
      replaceAtlassianAuths([oauthAuth("cloud-2", "https://example2.atlassian.net", "token-broken")]);

      const fetchMock = vi.fn(async () => {
        throw new Error("network unreachable");
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const account = { id: "cloud-2", provider: "atlassian" } as const;
      const result = yield* resolveT3workAtlassianViewerAccountId(account);

      assert.strictEqual(result, undefined);
      const flattened = entries.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
      const textPart = flattened.some(
        (part) => typeof part === "string" && part.includes("failed to resolve Atlassian viewer accountId"),
      );
      const annotationPart = flattened.some(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          (part as Record<string, unknown>)["accountId"] === "cloud-2" &&
          (part as Record<string, unknown>)["provider"] === "atlassian",
      );
      assert.isTrue(textPart, `expected a warning message, got: ${JSON.stringify(entries)}`);
      assert.isTrue(
        annotationPart,
        `expected the warning to carry accountId/provider, got: ${JSON.stringify(entries)}`,
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          testLayer("t3work-atlassian-viewer-identity-warn-"),
          Logger.layer([logger], { mergeWithExisting: false }),
        ),
      ),
    );
  },
);
