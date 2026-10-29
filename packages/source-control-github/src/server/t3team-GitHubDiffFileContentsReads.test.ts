import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as TestSourceControlHost from "@t3tools/source-control-testing/TestSourceControlHost";
import { jsonResponse, makeGitHubApiHarness } from "./t3team-githubApiTestHarness.ts";
import * as GitHubAppAccess from "./GitHubAppAccess.ts";
import * as GitHubPullRequestApi from "./GitHubPullRequestApi.ts";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const FILE_COUNT = 20;

function harnessWithConcurrencyProbe() {
  let active = 0;
  let peak = 0;
  const base = makeGitHubApiHarness(async (request) => {
    if (request.url.includes("/contents/")) {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => Promise.resolve());
      active -= 1;
      return new Response("file body", { status: 200 });
    }
    return jsonResponse({ base: { sha: BASE }, head: { sha: HEAD } });
  });
  return { ...base, peak: () => peak };
}

const fileInput = (index: number) => ({
  cwd: "/w",
  repository: "hive/nx-nexi",
  host: "nexplore.ghe.com",
  number: 7,
  changeType: "change" as const,
  oldPath: `src/file-${index}.ts`,
  newPath: `src/file-${index}.ts`,
});

describe("getPullRequestDiffFileContents", () => {
  it.effect("reads a 20-file diff with one refs read, and a re-opened diff from memory", () => {
    const { layer, sent, peak } = harnessWithConcurrencyProbe();
    const stack = GitHubPullRequestApi.layer.pipe(
      Layer.provideMerge(GitHubAppAccess.layer),
      Layer.provideMerge(layer),
      Layer.provide(NodeCrypto.layer),
      Layer.provide(TestSourceControlHost.layer()),
      Layer.provide(NodeServices.layer),
    );
    return Effect.gen(function* () {
      const cli = yield* GitHubPullRequestApi.GitHubPullRequestApi;
      const indexes = Array.from({ length: FILE_COUNT }, (_, index) => index);
      yield* Effect.forEach(
        indexes,
        (index) => cli.getPullRequestDiffFileContents(fileInput(index)),
        {
          concurrency: "unbounded",
        },
      );
      assert.strictEqual(sent("/pulls/7"), 1);
      assert.strictEqual(sent("/contents/"), FILE_COUNT * 2);
      assert.isAtMost(peak(), 6);
      yield* Effect.forEach(
        indexes,
        (index) => cli.getPullRequestDiffFileContents(fileInput(index)),
        {
          concurrency: "unbounded",
        },
      );
      assert.strictEqual(sent("/contents/"), FILE_COUNT * 2);
    }).pipe(Effect.provide(stack));
  });
});
