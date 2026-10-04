import {
  ProjectId,
  ThreadId,
  type ServerProvider,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ProviderRegistryShape } from "./provider/Services/ProviderRegistry.ts";
import {
  PROVIDER_USAGE_NOTIFICATION_MAX_AGE_MS,
  PROVIDER_USAGE_NOTIFICATION_REFRESH_MS,
  makeProviderUsageNotificationLine,
  providerUsageNotificationLine,
  selectProviderUsageObservation,
} from "./t3team-providerUsageNotification.ts";
import {
  countLiveChildrenOnProvider,
  loadInFlightOnProvider,
} from "./t3team-providerUsageNotificationChildren.ts";
import type { ChildThreadShell } from "./t3team-toolBrokerChildrenTypes.ts";

const NOW = Date.parse("2026-09-23T10:00:00Z");
const window = {
  id: "five_hour",
  kind: "session",
  label: "5 hour",
  usedPercent: 83,
  resetsAt: "2026-09-23T10:59:00Z",
  windowDurationMins: 300,
} as ServerProviderUsageWindow;
const sample = { checkedAt: "2026-09-23T09:59:50Z", window };
const format = (over: Partial<Parameters<typeof providerUsageNotificationLine>[0]> = {}) =>
  providerUsageNotificationLine({
    provider: "claudeAgent",
    parentThreadId: "parent-1",
    providerUsageSample: sample,
    inFlightOnProvider: 5,
    nowMs: NOW,
    ...over,
  });

describe("provider usage notification line", () => {
  it("prints one complete parseable line with shared severity", () => {
    expect(format()).toBe(
      "\n[provider-usage] claudeAgent: 83% of 5h window (resets 2026-09-23T10:59:00Z, warning) · 5 in-flight children on this provider",
    );
  });
  it("omits absent and failing source data", () => {
    expect(format({ provider: null })).toBe("");
    expect(format({ providerUsageSample: null })).toBe("");
    expect(
      format({ providerUsageSample: { ...sample, window: { ...window, resetsAt: undefined } } }),
    ).toBe("");
  });
  it("omits stale, future, and expired samples", () => {
    expect(
      format({
        providerUsageSample: {
          ...sample,
          checkedAt: DateTime.formatIso(
            DateTime.makeUnsafe(NOW - PROVIDER_USAGE_NOTIFICATION_MAX_AGE_MS - 1_000),
          ),
        },
      }),
    ).toBe("");
    expect(format({ providerUsageSample: { ...sample, checkedAt: "2026-09-23T10:01:00Z" } })).toBe(
      "",
    );
    expect(
      format({
        providerUsageSample: { ...sample, window: { ...window, resetsAt: "2026-09-23T09:59:59Z" } },
      }),
    ).toBe("");
  });
});

it("prefers a fresh provider read over a still-valid cached snapshot", () => {
  const cached = { provider: "claudeAgent", sample };
  const fresh = {
    provider: "claudeAgent",
    sample: {
      ...sample,
      checkedAt: "2026-09-23T10:00:00Z",
      window: { ...window, usedPercent: 90 },
    },
  };
  expect(selectProviderUsageObservation({ fresh, cached, nowMs: NOW })).toBe(fresh);
});

it("falls back after a timeout only while the cached sample is under 90 seconds old", () => {
  const cached = { provider: "claudeAgent", sample };
  expect(selectProviderUsageObservation({ cached, nowMs: NOW })).toBe(cached);
  expect(selectProviderUsageObservation({ cached, nowMs: NOW + 90_001 })).toBeUndefined();
});

const shell = (instanceId: string, status: string, settledOverride?: string) =>
  ({
    modelSelection: { instanceId },
    session: { status },
    latestTurn: status === "ready" ? { state: "completed" } : null,
    settledOverride,
  }) as unknown as ChildThreadShell;

it("counts only live, unsettled children on the same instance", () => {
  expect(
    countLiveChildrenOnProvider(
      [
        shell("claudeAgent", "running"),
        shell("claudeAgent", "running", "settled"),
        shell("claudeAgent", "ready"),
        shell("codex", "running"),
      ],
      "claudeAgent",
    ),
  ).toBe(1);
});

it.effect("queries only the notified parent's children", () =>
  Effect.gen(function* () {
    const seenParents: string[] = [];
    const shells = new Map([
      ["mine", shell("claudeAgent", "running")],
      ["settled", shell("claudeAgent", "running", "settled")],
      ["other-provider", shell("codex", "running")],
      ["theirs", shell("claudeAgent", "running")],
    ]);
    const query = {
      listChildThreadIdsByParent: (parentId: string, projectId: string) => {
        seenParents.push(`${parentId}:${projectId}`);
        return Effect.succeed(["mine", "settled", "other-provider"].map((id) => ThreadId.make(id)));
      },
      getThreadShellById: (id: string) =>
        Effect.succeed(
          shells.has(String(id)) ? Option.some(shells.get(String(id))!) : Option.none(),
        ),
    } as unknown as ProjectionSnapshotQueryShape;
    const count = yield* loadInFlightOnProvider(query, {
      parentThreadId: "parent-1",
      projectId: "project-1",
      provider: "claudeAgent",
    });
    expect(seenParents).toEqual([`${ThreadId.make("parent-1")}:${ProjectId.make("project-1")}`]);
    expect(count).toBe(1);
  }),
);

it.effect("omits the block when the provider has no live-limit source", () =>
  Effect.gen(function* () {
    const registry = {
      getProviders: Effect.succeed([]),
      refreshInstance: () => Effect.succeed([]),
    } as unknown as ProviderRegistryShape;
    const read = makeProviderUsageNotificationLine({
      query: {} as ProjectionSnapshotQueryShape,
      registry,
    });
    expect(
      yield* read({ provider: "custom", parentThreadId: "parent", projectId: "project" }),
    ).toBe("");
  }),
);

it.effect("omits the block when the provider refresh fails", () =>
  Effect.gen(function* () {
    const registry = {
      getProviders: Effect.succeed([]),
      refreshInstance: () => Effect.die("probe failed"),
    } as unknown as ProviderRegistryShape;
    const read = makeProviderUsageNotificationLine({
      query: {} as ProjectionSnapshotQueryShape,
      registry,
    });
    expect(
      yield* read({ provider: "claudeAgent", parentThreadId: "parent", projectId: "project" }),
    ).toBe("");
  }),
);

const liveProvider = (usedPercent: number, ageMs = 0): ServerProvider =>
  ({
    instanceId: "claudeAgent",
    usageLimits: {
      checkedAt: DateTime.formatIso(
        DateTime.subtract(DateTime.nowUnsafe(), { milliseconds: ageMs }),
      ),
      windows: [
        {
          ...window,
          usedPercent,
          resetsAt: DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 })),
        },
      ],
    },
  }) as unknown as ServerProvider;

const makeReaderHarness = (
  cached: ServerProvider,
  refresh: Effect.Effect<ReadonlyArray<ServerProvider>>,
) => {
  const refreshedInstances: string[] = [];
  const queriedParents: string[] = [];
  const registry = {
    getProviders: Effect.succeed([cached]),
    refreshInstance: (instanceId: string) => {
      refreshedInstances.push(instanceId);
      return refresh;
    },
  } as unknown as ProviderRegistryShape;
  const query = {
    listChildThreadIdsByParent: (parentId: string, projectId: string) => {
      queriedParents.push(`${parentId}:${projectId}`);
      return Effect.succeed([ThreadId.make("live-child")]);
    },
    getThreadShellById: () => Effect.succeed(Option.some(shell("claudeAgent", "running"))),
  } as unknown as ProjectionSnapshotQueryShape;
  const read = makeProviderUsageNotificationLine({ registry, query });
  return {
    result: read({ provider: "claudeAgent", parentThreadId: "parent-1", projectId: "project-1" }),
    refreshedInstances,
    queriedParents,
  };
};

it.effect("refreshes the selected instance and formats the fresh usage instead of the cache", () =>
  Effect.gen(function* () {
    const h = makeReaderHarness(liveProvider(83, 10_000), Effect.succeed([liveProvider(90)]));
    const line = yield* h.result;
    expect(line).toContain("\n[provider-usage] claudeAgent: 90% of 5h window");
    expect(line).toContain("1 in-flight children on this provider");
    expect(h.refreshedInstances).toEqual(["claudeAgent"]);
    expect(h.queriedParents).toEqual(["parent-1:project-1"]);
  }),
);

it.effect("uses recent cached usage when the refresh fails", () =>
  Effect.gen(function* () {
    const h = makeReaderHarness(liveProvider(83, 10_000), Effect.die("probe failed"));
    expect(yield* h.result).toContain("claudeAgent: 83% of 5h window");
    expect(h.queriedParents).toEqual(["parent-1:project-1"]);
  }),
);

it.effect("bounds a hanging refresh and uses recent cached usage", () =>
  Effect.gen(function* () {
    const h = makeReaderHarness(liveProvider(83, 10_000), Effect.never);
    const fiber = yield* h.result.pipe(Effect.forkScoped);
    yield* Effect.yieldNow;
    yield* TestClock.adjust(Duration.millis(PROVIDER_USAGE_NOTIFICATION_REFRESH_MS));
    expect(yield* Fiber.join(fiber)).toContain("claudeAgent: 83% of 5h window");
    expect(h.refreshedInstances).toEqual(["claudeAgent"]);
  }).pipe(Effect.provide(TestClock.layer())),
);

it.effect("suppresses cached usage when refresh confirms the source is unsupported", () =>
  Effect.gen(function* () {
    const unsupported = {
      ...liveProvider(90),
      usageLimits: {
        checkedAt: DateTime.formatIso(DateTime.nowUnsafe()),
        windows: [],
        unavailable: { reason: "unsupported" as const },
      },
    };
    const h = makeReaderHarness(liveProvider(83, 10_000), Effect.succeed([unsupported]));
    expect(yield* h.result).toBe("");
    expect(h.queriedParents).toEqual([]);
  }),
);
