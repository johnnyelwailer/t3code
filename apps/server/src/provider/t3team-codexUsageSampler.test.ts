/**
 * Unit tests for the Codex usage sampler's freshness budget: a stored
 * `account/rateLimits/updated` snapshot is only sampled while it is younger
 * than `CODEX_RATE_LIMITS_FRESHNESS_MS`; older ones count as "no data".
 */
import { assert, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as TestClock from "effect/testing/TestClock";
import { afterEach, describe } from "vite-plus/test";

import {
  CODEX_RATE_LIMITS_FRESHNESS_MS,
  resetCodexRateLimitsStore,
  sampleCodexUsage,
  setLatestCodexRateLimits,
} from "./t3team-codexUsageSampler.ts";
import { type CodexRateLimitsBody } from "./t3team-providerUsageMappers.ts";
import { ProviderUsageSamplerError } from "./t3team-providerUsageSampler.ts";

const exhaustedBody: CodexRateLimitsBody = {
  rateLimits: {
    primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 1_757_246_688 },
    secondary: { usedPercent: 40, windowDurationMins: 10_080, resetsAt: 1_757_764_800 },
  },
};

const expectNoData = (exit: Exit.Exit<unknown, ProviderUsageSamplerError>) => {
  assert.isTrue(Exit.isFailure(exit));
  if (Exit.isFailure(exit)) {
    const error = Cause.squash(exit.cause) as ProviderUsageSamplerError;
    assert.instanceOf(error, ProviderUsageSamplerError);
    assert.match(error.reason, /No rate-limit notification received/);
  }
};

describe("sampleCodexUsage freshness", () => {
  afterEach(() => resetCodexRateLimitsStore());

  it.effect("fails with no-data when nothing was received yet", () =>
    Effect.gen(function* () {
      expectNoData(yield* Effect.exit(sampleCodexUsage({})));
    }),
  );

  it.effect("samples a fresh snapshot", () =>
    Effect.gen(function* () {
      const nowMs = yield* Clock.currentTimeMillis;
      setLatestCodexRateLimits(exhaustedBody, nowMs);
      yield* TestClock.adjust(Duration.millis(CODEX_RATE_LIMITS_FRESHNESS_MS - 1));
      const report = yield* sampleCodexUsage({});
      assert.equal(report.windows[0]!.window, "primary");
      assert.equal(report.windows[0]!.severity, "critical");
    }),
  );

  it.effect("rejects a snapshot that reached the 10-minute budget", () =>
    Effect.gen(function* () {
      const nowMs = yield* Clock.currentTimeMillis;
      setLatestCodexRateLimits(exhaustedBody, nowMs);
      yield* TestClock.adjust(Duration.millis(CODEX_RATE_LIMITS_FRESHNESS_MS));
      expectNoData(yield* Effect.exit(sampleCodexUsage({})));
    }),
  );

  it.effect("a newer notification revives the store", () =>
    Effect.gen(function* () {
      const startMs = yield* Clock.currentTimeMillis;
      setLatestCodexRateLimits(exhaustedBody, startMs);
      yield* TestClock.adjust(Duration.millis(CODEX_RATE_LIMITS_FRESHNESS_MS * 2));
      expectNoData(yield* Effect.exit(sampleCodexUsage({})));
      const nowMs = yield* Clock.currentTimeMillis;
      setLatestCodexRateLimits(exhaustedBody, nowMs);
      const report = yield* sampleCodexUsage({});
      assert.equal(report.windows.length, 2);
    }),
  );
});
