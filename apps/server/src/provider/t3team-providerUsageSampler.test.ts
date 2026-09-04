/**
 * Unit tests for the live Claude usage sampler (mocked wire response).
 *
 * The mapping assertions live in `t3team-providerUsageMappers.test.ts`;
 * here we only exercise the sampler's plumbing: credential pass-through,
 * fetcher injection, and error propagation.
 */
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderDriverKind } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/unstable/http";
import { describe } from "vite-plus/test";

import { type ClaudeUsageBody } from "./t3team-providerUsageMappers.ts";
import { sampleClaudeUsage } from "./t3team-claudeUsageSampler.ts";
import { ProviderUsageSamplerError } from "./t3team-providerUsageSampler.ts";

const CLAUDE = ProviderDriverKind.make("claudeAgent");

const claudeUsageFixture: ClaudeUsageBody = {
  five_hour: { utilization: 100.0, resets_at: "2026-09-03T18:09:59.994384+00:00" },
  seven_day: { utilization: 49.0, resets_at: "2026-09-07T00:59:59.994413+00:00" },
  limits: [
    { kind: "session", percent: 100, severity: "critical" },
    { kind: "weekly_all", percent: 49, severity: "normal" },
  ],
};

describe("sampleClaudeUsage", () => {
  const httpLayer = Layer.merge(NodeServices.layer, FetchHttpClient.layer);

  it.effect("maps a mocked OAuth usage response end to end", () =>
    Effect.gen(function* () {
      let seenToken: string | undefined;
      const report = yield* sampleClaudeUsage({
        credentials: { accessToken: "sk-ant-oat-test-token", subscriptionType: "team" },
        fetchUsageBody: (accessToken) => {
          seenToken = accessToken;
          return Effect.succeed(claudeUsageFixture);
        },
      });
      assert.equal(seenToken, "sk-ant-oat-test-token");
      assert.equal(report.plan, "team");
      assert.equal(report.windows.length, 2);
      assert.equal(report.windows[0]!.severity, "critical");
      assert.equal(report.windows[1]!.severity, "normal");
      assert.isString(report.windows[0]!.sampledAt);
      assert.equal(report.provider, CLAUDE);
    }).pipe(Effect.provide(httpLayer)),
  );

  it.effect("propagates a sampler error from the fetcher with its reason", () =>
    Effect.gen(function* () {
      const exit = yield* sampleClaudeUsage({
        credentials: { accessToken: "sk-ant-oat-test-token" },
        fetchUsageBody: () =>
          Effect.fail(
            new ProviderUsageSamplerError({
              provider: CLAUDE,
              reason: "Anthropic usage endpoint returned HTTP 429.",
            }),
          ),
      }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(exit));
      const error = Cause.squash((exit as Exit.Failure<never, unknown>).cause);
      assert.match((error as { readonly reason: string }).reason, /HTTP 429/);
    }).pipe(Effect.provide(httpLayer)),
  );
});
