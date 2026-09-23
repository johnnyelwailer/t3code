/**
 * Sweep invariant: a critical primary window only opens a hold when its
 * `resetsAt` is in the future (or unknown). A critical window whose reset
 * already passed is a stale snapshot, never a live limit.
 */
import { assert, it } from "@effect/vitest";
import type { ServerSettings } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import { afterEach, describe } from "vite-plus/test";

import {
  resetCodexRateLimitsStore,
  setLatestCodexRateLimits,
} from "./provider/t3team-codexUsageSampler.ts";
import { isLiveCriticalPrimary, sweepPass } from "./t3team-providerUsageWatcherSweep.ts";
import type {
  ProviderUsageWatcherDeps,
  ProviderUsageWatcherState,
} from "./t3team-providerUsageWatcherTypes.ts";

/** The real incident: sweep at 2026-09-14T09:26Z, snapshot resetsAt 2026-09-07T12:04:48Z. */
const NOW_MS = Date.parse("2026-09-14T09:26:00.000Z");
const PAST_RESET_S = Math.floor(Date.parse("2026-09-07T12:04:48Z") / 1000);
const FUTURE_RESET_S = Math.floor((NOW_MS + 60 * 60_000) / 1000);

const exhaustedBody = (resetsAt: number) => ({
  rateLimits: {
    primary: { usedPercent: 100, windowDurationMins: 300, resetsAt },
    secondary: { usedPercent: 40, windowDurationMins: 10_080, resetsAt: resetsAt + 86_400 },
  },
});

const makeDeps = () => {
  const state: ProviderUsageWatcherState = {
    heldDrivers: new Map(),
    warningDrivers: new Map(),
    lastSampledAt: null,
    sweepInFlight: false,
  };
  const upserts: Array<{ readonly threadId: string; readonly resetsAt: string | null }> = [];
  const activities: Array<{ readonly kind: string; readonly summary: string }> = [];
  const settings = { providerInstances: {} } as unknown as ServerSettings;
  const deps = {
    settingsService: { getSettings: Effect.succeed(settings) },
    providerService: {
      listSessions: () => Effect.succeed([{ providerInstanceId: "codex" }]),
    },
    engine: {},
    holds: {
      listActiveSessionThreadsForDriver: () => Effect.succeed([{ threadId: "thread-1" }]),
      upsertActiveHold: (input: { readonly threadId: string; readonly resetsAt: string | null }) =>
        Effect.sync(() => {
          upserts.push({ threadId: input.threadId, resetsAt: input.resetsAt });
        }),
    },
    devForceEnabled: false,
    state,
    nowIso: () => DateTime.formatIso(DateTime.makeUnsafe(NOW_MS)),
    appendActivity: (_threadId: string, kind: string, summary: string) =>
      Effect.sync(() => {
        activities.push({ kind, summary });
      }),
  } as unknown as ProviderUsageWatcherDeps;
  return { deps, state, upserts, activities };
};

describe("isLiveCriticalPrimary", () => {
  it("rejects a critical primary whose resetsAt already passed", () => {
    assert.isFalse(
      isLiveCriticalPrimary({ severity: "critical", resetsAt: "2026-09-07T12:04:48Z" }, NOW_MS),
    );
  });
  it("accepts a critical primary with a future or unknown resetsAt", () => {
    assert.isTrue(
      isLiveCriticalPrimary({ severity: "critical", resetsAt: "2026-09-14T10:26:00Z" }, NOW_MS),
    );
    assert.isTrue(isLiveCriticalPrimary({ severity: "critical", resetsAt: null }, NOW_MS));
  });
  it("never treats a non-critical window as a hold candidate", () => {
    assert.isFalse(isLiveCriticalPrimary({ severity: "warning", resetsAt: null }, NOW_MS));
  });
});

describe("sweepPass hold invariant", () => {
  afterEach(() => resetCodexRateLimitsStore());

  const seed = (resetsAt: number) =>
    Effect.gen(function* () {
      yield* TestClock.adjust(Duration.millis(NOW_MS));
      setLatestCodexRateLimits(exhaustedBody(resetsAt), NOW_MS);
    });

  it.effect("does not open a hold on a critical primary with a past resetsAt", () =>
    Effect.gen(function* () {
      yield* seed(PAST_RESET_S);
      const { deps, state, upserts, activities } = makeDeps();
      yield* sweepPass(deps);
      assert.isNotNull(state.lastSampledAt, "the sample itself was accepted");
      assert.equal(state.heldDrivers.size, 0);
      assert.equal(upserts.length, 0);
      assert.deepEqual(
        activities.filter((activity) => activity.kind.includes("hold")),
        [],
      );
    }),
  );

  it.effect("still opens a hold on a critical primary with a future resetsAt", () =>
    Effect.gen(function* () {
      yield* seed(FUTURE_RESET_S);
      const { deps, state, upserts } = makeDeps();
      yield* sweepPass(deps);
      assert.equal(state.heldDrivers.size, 1);
      assert.equal(upserts.length, 1);
      assert.equal(
        upserts[0]!.resetsAt,
        DateTime.formatIso(DateTime.makeUnsafe(FUTURE_RESET_S * 1000)),
      );
    }),
  );

  it.effect("does not refresh an existing hold from a past-resetsAt snapshot", () =>
    Effect.gen(function* () {
      yield* seed(PAST_RESET_S);
      const { deps, state, activities } = makeDeps();
      const liveResetsAt = DateTime.formatIso(DateTime.makeUnsafe(FUTURE_RESET_S * 1000));
      state.heldDrivers.set("codex", {
        driver: "codex",
        since: deps.nowIso(),
        resetsAt: liveResetsAt,
        instanceIds: ["codex"],
        percentUsed: 100,
      });
      yield* sweepPass(deps);
      assert.equal(state.heldDrivers.get("codex")!.resetsAt, liveResetsAt);
      assert.equal(activities.filter((activity) => activity.kind.includes("hold")).length, 0);
    }),
  );
});
