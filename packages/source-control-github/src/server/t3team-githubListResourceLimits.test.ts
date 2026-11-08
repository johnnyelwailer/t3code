import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestSourceControlHost from "@t3tools/source-control-testing/TestSourceControlHost";

import * as GitHubAppAccess from "./GitHubAppAccess.ts";
import * as GitHubPullRequestApi from "./GitHubPullRequestApi.ts";
import { jsonResponse, makeGitHubApiHarness } from "./t3team-githubApiTestHarness.ts";

const HOST = "nexplore.ghe.com";

// Every field upstream's listing row decoder requires; a row missing one is skipped as malformed.
const row = (number: number, rollup: { state: string } | null) => ({
  author: null,
  state: "OPEN",
  isDraft: false,
  mergeable: "UNKNOWN",
  reviewDecision: null,
  latestReviews: { nodes: [] },
  mergedAt: null,
  reviewRequests: { nodes: [] },
  labels: { nodes: [] },
  number,
  title: `Pull request ${number}`,
  url: `https://${HOST}/hive/ops/pull/${number}`,
  headRefName: "feat/x",
  baseRefName: "main",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-02T00:00:00Z",
  repository: { nameWithOwner: "hive/ops" },
  commits: { nodes: [{ commit: { statusCheckRollup: rollup } }] },
});

const rollupError = (index: number, type: string) => ({
  type,
  path: ["search", "nodes", index, "commits", "nodes", 0, "commit", "statusCheckRollup"],
  message: "Resource limits for this query exceeded.",
});

/** What a GHE search answers for a repository whose check rollups it cannot compute in budget. */
const partialAnswer = (errorType: string) =>
  jsonResponse({
    data: {
      search: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [row(1, null), row(2, { state: "SUCCESS" })],
      },
    },
    errors: [rollupError(0, errorType)],
  });

const listOps = Effect.gen(function* () {
  const api = yield* GitHubPullRequestApi.GitHubPullRequestApi;
  return yield* api.listPullRequests({
    cwd: "/w",
    repository: "hive/ops",
    host: HOST,
    state: "all",
    involvement: "all",
    viewer: "pj",
    limit: 99,
  });
});

const serving = (respond: () => Response) => {
  const { layer } = makeGitHubApiHarness(respond);
  return GitHubPullRequestApi.layer.pipe(
    Layer.provideMerge(GitHubAppAccess.layer),
    Layer.provideMerge(layer),
    Layer.provide(NodeCrypto.layer),
    Layer.provide(TestSourceControlHost.layer()),
    Layer.provide(NodeServices.layer),
  );
};

it.effect(
  "lists the rows GitHub could read when it ran out of resources for some check rollups",
  () =>
    Effect.gen(function* () {
      const batch = yield* listOps;

      assert.deepStrictEqual(
        batch.items.map((item) => [item.number, item.checksState]),
        [
          [1, null],
          [2, "passing"],
        ],
      );
    }).pipe(Effect.provide(serving(() => partialAnswer("RESOURCE_LIMITS_EXCEEDED")))),
);

it.effect("still fails a listing whose errors are anything else", () =>
  Effect.gen(function* () {
    const error = yield* listOps.pipe(Effect.flip);

    assert.strictEqual(error._tag, "GitHubApiResponseError");
  }).pipe(Effect.provide(serving(() => partialAnswer("INTERNAL")))),
);
