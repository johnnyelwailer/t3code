import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import * as GitHubApi from "./t3team-GitHubApi.ts";
import { jsonResponse, makeGitHubApiHarness } from "./t3team-githubApiTestHarness.ts";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");
const RESET_SECONDS = String(NOW / 1000 + 60);

const searchQuota = (remaining: number) => ({
  "x-ratelimit-resource": "search",
  "x-ratelimit-limit": "30",
  "x-ratelimit-remaining": String(remaining),
  "x-ratelimit-reset": RESET_SECONDS,
});

const search = { host: "github.com", operation: "search", path: "search/issues?q=is%3Apr" };
const core = { host: "github.com", operation: "pull", path: "repos/acme/web/pulls/1" };

describe("search is its own quota", () => {
  it.effect(
    "a background search stops at the search reserve while core reads and a user's search go on",
    () => {
      const { layer, sent } = makeGitHubApiHarness((request) =>
        request.url.includes("/search/")
          ? jsonResponse({ items: [] }, { headers: searchQuota(2) })
          : jsonResponse({}),
      );
      return Effect.gen(function* () {
        yield* TestClock.setTime(NOW);
        const api = yield* GitHubApi.GitHubApi;
        yield* api.rest(search);
        const held = yield* Effect.flip(api.rest(search));
        assert.strictEqual(held._tag, "SourceControlRateLimitPausedError");
        assert.strictEqual(sent("/search/"), 1);
        yield* api.rest(core);
        assert.strictEqual(sent("/pulls/1"), 1);
        yield* api.rest({ ...search, allowReserve: true });
        assert.strictEqual(sent("/search/"), 2);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect("a refused search pauses the host until GitHub's reset", () => {
    const { layer, sent } = makeGitHubApiHarness((request) =>
      request.url.includes("/search/")
        ? jsonResponse(
            { message: "API rate limit exceeded" },
            { status: 403, headers: { ...searchQuota(0) } },
          )
        : jsonResponse({}),
    );
    return Effect.gen(function* () {
      yield* TestClock.setTime(NOW);
      const api = yield* GitHubApi.GitHubApi;
      const refused = yield* Effect.flip(api.rest(search));
      assert.strictEqual(refused._tag, "GitHubApiRateLimitError");
      const paused = yield* Effect.flip(api.rest(core));
      assert.strictEqual(paused._tag, "SourceControlRateLimitPausedError");
      assert.strictEqual(sent("/pulls/1"), 0);
      yield* TestClock.adjust("61 seconds");
      yield* api.rest(core);
      assert.strictEqual(sent("/pulls/1"), 1);
    }).pipe(Effect.provide(layer));
  });
});
