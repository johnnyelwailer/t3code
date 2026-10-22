import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as GitHubCredentials from "@t3tools/source-control-github/server/GitHubCredentials";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import { SourceControlProviderKind } from "@t3tools/contracts";
import { toCloudSessionFailure } from "./t3team-CloudSessionErrors.ts";

describe("toCloudSessionFailure", () => {
  it.effect("names the host a refused or missing credential belongs to", () =>
    Effect.sync(() => {
      const refused = toCloudSessionFailure(
        new GitHubApi.GitHubApiAuthenticationError({
          host: "github.example.com",
          operation: "cloudSession.listRuns",
        }),
      );
      assert.strictEqual(refused.reason, "unauthorized");
      assert.strictEqual(refused.host, "github.example.com");
      const missing = toCloudSessionFailure(
        new GitHubCredentials.GitHubNotSignedInError({ host: "nexplore.ghe.com" }),
      );
      assert.strictEqual(missing.reason, "unauthorized");
      assert.strictEqual(missing.host, "nexplore.ghe.com");
    }),
  );

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
          provider: SourceControlProviderKind.make("github"),
          host: "nexplore.ghe.com",
          retryAt: 1_700_000_000_100,
        }),
      );
      assert.strictEqual(failure.reason, "rejected");
      assert.strictEqual(failure.retryAt, 1_700_000_000_100);
    }),
  );
});
