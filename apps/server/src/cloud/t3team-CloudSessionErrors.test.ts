import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitHubApi from "../sourceControl/GitHubApi.ts";
import * as SourceControlRateLimit from "../sourceControl/SourceControlRateLimit.ts";
import { toCloudSessionFailure } from "./t3team-CloudSessionErrors.ts";

describe("toCloudSessionFailure", () => {
  it.effect("surfaces retryAt from a GitHub API rate-limit error", () =>
    Effect.sync(() => {
      const failure = toCloudSessionFailure(
        new GitHubApi.GitHubApiRateLimitError({
          host: "nexplore.ghe.com",
          operation: "cloudSession.listRuns",
          retryAt: 1_700_000_000_000,
        }),
      );
      assert.strictEqual(failure.reason, "rejected");
      assert.strictEqual(failure.retryAt, 1_700_000_000_000);
    }),
  );

  it.effect("surfaces retryAt from a SourceControlRateLimit pause", () =>
    Effect.sync(() => {
      const failure = toCloudSessionFailure(
        new SourceControlRateLimit.SourceControlRateLimitPausedError({
          provider: "github",
          host: "nexplore.ghe.com",
          retryAt: 1_700_000_000_100,
        }),
      );
      assert.strictEqual(failure.reason, "rejected");
      assert.strictEqual(failure.retryAt, 1_700_000_000_100);
    }),
  );
});
