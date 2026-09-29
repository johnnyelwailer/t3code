import { ProjectId, ThreadId, type ServerProviderUsageWindow } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ProviderRegistryShape } from "./provider/Services/ProviderRegistry.ts";
import {
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
    expect(format({ providerUsageSample: { ...sample, checkedAt: "2026-09-23T09:58:00Z" } })).toBe(
      "",
    );
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
