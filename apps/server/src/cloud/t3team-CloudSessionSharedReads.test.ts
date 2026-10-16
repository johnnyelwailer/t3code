import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import {
  jsonResponse,
  makeGitHubApiHarness,
} from "@t3tools/source-control-github/server/t3team-githubApiTestHarness";
import { discoveryDelayMs } from "./t3team-CloudSessionDispatch.ts";
import { makeSessionGh } from "./t3team-CloudSessionGh.ts";
import { type CloudSessionRepoRef } from "./t3team-githubActionsSessionClient.ts";

const REPO: CloudSessionRepoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

const NOW = Date.parse("2026-10-12T12:00:00.000Z");

const answerByPath = (request: { readonly url: string }) =>
  request.url.endsWith("/user")
    ? jsonResponse({ login: "pj" })
    : request.url.includes("/jobs")
      ? jsonResponse({ jobs: [] })
      : jsonResponse({ workflow_runs: [] });

describe("cloud session reads share one GitHub request", () => {
  it.effect("N clients listing at once cost one runs request and one identity request", () => {
    const { layer, sent } = makeGitHubApiHarness(answerByPath);
    return Effect.gen(function* () {
      const api = yield* GitHubApi.GitHubApi;
      const clients = yield* Effect.forEach(Array.from({ length: 8 }), () =>
        makeSessionGh(api, REPO),
      );
      yield* Effect.forEach(
        clients,
        (gh) =>
          gh
            .resolveLogin({ allowReserve: false })
            .pipe(Effect.flatMap((login) => gh.listRunsFor(login, { allowReserve: false }))),
        { concurrency: "unbounded" },
      );
      assert.strictEqual(sent("/actions/workflows/session.yml/runs"), 1);
      assert.strictEqual(sent("ghe.com/user"), 1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("answers a later list from the short cache, then reads again once it expires", () => {
    const { layer, sent } = makeGitHubApiHarness(answerByPath);
    return Effect.gen(function* () {
      const gh = yield* makeSessionGh(yield* GitHubApi.GitHubApi, REPO);
      yield* gh.listRunsFor("pj", { allowReserve: false });
      yield* gh.listRunsFor("pj", { allowReserve: false });
      assert.strictEqual(sent("/runs"), 1);
      yield* TestClock.adjust("5 seconds");
      yield* gh.listRunsFor("pj", { allowReserve: false });
      assert.strictEqual(sent("/runs"), 2);
    }).pipe(Effect.provide(layer));
  });

  it.effect("a user's own create or cancel list never reads a cached answer", () => {
    const { layer, sent } = makeGitHubApiHarness(answerByPath);
    return Effect.gen(function* () {
      const gh = yield* makeSessionGh(yield* GitHubApi.GitHubApi, REPO);
      yield* gh.listRunsFor("pj", { allowReserve: false });
      yield* gh.listRunsFor("pj", { allowReserve: true });
      assert.strictEqual(sent("/runs"), 2);
    }).pipe(Effect.provide(layer));
  });

  it.effect("a paused host sends nothing for a list, and a user's cancel still goes out", () => {
    const { layer, sent } = makeGitHubApiHarness((request) =>
      request.url.endsWith("/user")
        ? jsonResponse({ login: "pj" })
        : jsonResponse(
            { message: "rate limit" },
            { status: 429, headers: { "retry-after": "60" } },
          ),
    );
    return Effect.gen(function* () {
      yield* TestClock.setTime(NOW);
      const gh = yield* makeSessionGh(yield* GitHubApi.GitHubApi, REPO);
      const tripped = yield* Effect.flip(gh.listRunsFor("pj", { allowReserve: false }));
      assert.strictEqual(tripped.retryAt, NOW + 60_000);
      yield* TestClock.adjust("5 seconds");
      const refused = yield* Effect.flip(gh.listRunsFor("pj", { allowReserve: false }));
      assert.strictEqual(refused.retryAt, NOW + 60_000);
      assert.strictEqual(sent("/runs"), 1);
      yield* Effect.flip(gh.listRunsFor("pj", { allowReserve: true }));
      assert.strictEqual(sent("/runs"), 2);
    }).pipe(Effect.provide(layer));
  });
});

describe("discoveryDelayMs", () => {
  it("backs off from one second to a cap", () => {
    const delays = Array.from({ length: 8 }, (_, attempt) => discoveryDelayMs(attempt));
    assert.deepStrictEqual(delays, [1000, 1600, 2560, 4096, 6554, 8000, 8000, 8000]);
  });
});
