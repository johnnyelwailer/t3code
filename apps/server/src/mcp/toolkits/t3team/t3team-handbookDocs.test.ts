import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as GitHubCredentials from "@t3tools/source-control-github/server/GitHubCredentials";

import { HANDBOOK_FIXTURE_MARKDOWN } from "./__fixtures__/t3team-handbookPages.ts";
import { HandbookDocs, layer as HandbookDocsLayer } from "./t3team-handbookDocs.ts";

const treeBody = JSON.stringify({
  truncated: false,
  tree: Object.keys(HANDBOOK_FIXTURE_MARKDOWN).map((path) => ({
    path,
    type: "blob",
    sha: "a".repeat(40),
  })),
});

const mockApi = Layer.mock(GitHubApi.GitHubApi)({
  rest: (input) =>
    Effect.gen(function* () {
      if (input.path.includes("/git/trees/")) {
        return { status: 200, headers: {}, body: treeBody, truncated: false, invalidUtf8: false };
      }
      const match = /\/contents\/(.+)$/.exec(input.path);
      const path = match?.[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
      const markdown =
        path === undefined
          ? undefined
          : HANDBOOK_FIXTURE_MARKDOWN[path as keyof typeof HANDBOOK_FIXTURE_MARKDOWN];
      if (markdown === undefined) {
        return yield* new GitHubApi.GitHubApiNotFoundError({
          host: input.host,
          operation: input.operation,
        });
      }
      return { status: 200, headers: {}, body: markdown, truncated: false, invalidUtf8: false };
    }),
  credential: () =>
    Effect.succeed({
      token: Redacted.make("test-token"),
      fingerprint: "test",
    }),
});

const missingCredential = Layer.mock(GitHubApi.GitHubApi)({
  rest: () =>
    Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host: "nexplore.ghe.com" })),
  credential: () =>
    Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host: "nexplore.ghe.com" })),
});

describe("HandbookDocs", () => {
  it.effect("searches and loads pages from fixture tree without network", () =>
    Effect.gen(function* () {
      const docs = yield* HandbookDocs;
      const results = yield* docs.search("handbook mcp tools", 3);
      expect(results[0]?.path).toBe("Source/docs/platforms/mcp-tools.mdx");
      expect(results[0]?.url).toBe("https://docs.nexplore.dev/platforms/mcp-tools");
      const page = yield* docs.getPage("platforms/mcp-tools.mdx");
      expect(page.title).toBe("Host MCP tools");
      expect(page.markdown).toContain("nexplore_handbook");
      expect(page.url).toBe("https://docs.nexplore.dev/platforms/mcp-tools");
    }).pipe(Effect.provide(HandbookDocsLayer.pipe(Layer.provide(mockApi)))),
  );

  it.effect("returns a clear error when the GHE credential is missing", () =>
    Effect.gen(function* () {
      const docs = yield* HandbookDocs;
      const error = yield* Effect.flip(docs.search("auth"));
      expect(error._tag).toBe("OrchestratorMcpFailure");
      expect(error.message).toContain("No usable GitHub credential");
      expect(error.message).toContain("nexplore.ghe.com");
      expect(error.message.toLowerCase()).not.toContain("test-token");
      expect(JSON.stringify(error).toLowerCase()).not.toContain("token-value");
    }).pipe(Effect.provide(HandbookDocsLayer.pipe(Layer.provide(missingCredential)))),
  );

  it.effect("rejects missing handbook pages with a clear error", () =>
    Effect.gen(function* () {
      const docs = yield* HandbookDocs;
      const error = yield* Effect.flip(docs.getPage("Source/docs/missing.md"));
      expect(error.message).toContain("Handbook page not found");
      expect(error.message).toContain("Source/docs/missing.md");
    }).pipe(Effect.provide(HandbookDocsLayer.pipe(Layer.provide(mockApi)))),
  );
});
