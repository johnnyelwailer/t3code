import type {
  HostResourcesSnapshot,
  ResourcePressureEvent,
  ResourceTelemetrySnapshot,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/unstable/process";

import { runMigrations } from "./persistence/Migrations.ts";
import { ResourcePressureEventRepositoryLive } from "./persistence/Layers/t3team-ResourcePressureEvents.ts";
import {
  RESOURCE_PRESSURE_EVENT_RETENTION,
  ResourcePressureEventRepository,
  type ResourcePressureEventInput,
} from "./persistence/Services/t3team-ResourcePressureEvents.ts";
import * as HostResources from "./resourceTelemetry/HostResources.ts";
import * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import { DISABLED_REPORT, makeResourcePressureMonitor } from "./t3team-resourcePressureMonitor.ts";
import { buildAgentResourcePressurePayload } from "./t3team-toolBrokerResourcePressure.ts";
import { callT3TeamRuntimeReadTool } from "./t3team-toolBrokerRuntimeReadTools.ts";

const GIB = 1024 ** 3;
const calls = { host: 0, telemetry: 0 };

const host: HostResourcesSnapshot = {
  sampledAt: 1_000,
  cpuUtilization: 0.5,
  cpuCount: 8,
  availableMemoryBytes: 4 * GIB,
  totalMemoryBytes: 16 * GIB,
};
const telemetrySnapshot = {
  processes: [
    {
      identity: { pid: 4242, startTimeMs: 7 },
      ppid: 1,
      name: "claude",
      command: "claude --print",
      category: "provider-root",
      residentBytes: 7 * GIB,
      cpuPercent: 12,
    },
  ],
  groups: { allT3: { currentRssBytes: 7 * GIB, processCount: 1 } },
  readAt: DateTime.makeUnsafe(0),
} as unknown as ResourceTelemetrySnapshot;

const events: ResourcePressureEvent[] = [];
const stubs = Layer.mergeAll(
  Layer.succeed(HostResources.HostResources, {
    read: Effect.sync(() => {
      calls.host += 1;
      return host;
    }),
  }),
  Layer.succeed(ResourceTelemetry.ResourceTelemetry, {
    refresh: Effect.sync(() => {
      calls.telemetry += 1;
      return telemetrySnapshot;
    }),
    latest: Effect.succeed(telemetrySnapshot),
  } as unknown as ResourceTelemetry.ResourceTelemetry["Service"]),
  Layer.succeed(ResourcePressureEventRepository, {
    append: (event: ResourcePressureEventInput) =>
      Effect.sync(() => void events.unshift({ ...event, id: events.length + 1 })),
    listRecent: ({ limit }) => Effect.succeed(events.slice(0, limit)),
    readAccumulation: Effect.succeed({ worktreeThreadCount: 45, archivedWorktreeThreadCount: 30 }),
  }),
  Layer.succeed(HostProcessPlatform, "linux"),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    {} as unknown as ChildProcessSpawner.ChildProcessSpawner["Service"],
  ),
);

describe("ResourcePressureMonitor", () => {
  it.effect("flag off: constant disabled report, no sample taken", () =>
    Effect.gen(function* () {
      calls.host = 0;
      calls.telemetry = 0;
      const monitor = yield* makeResourcePressureMonitor({
        enabled: false,
        sampleIntervalMs: 20_000,
      });
      assert.deepStrictEqual(yield* monitor.report, DISABLED_REPORT);
      assert.strictEqual(calls.host + calls.telemetry, 0);
    }).pipe(Effect.scoped, Effect.provide(stubs)),
  );

  it.effect("flag on: one sample classifies, persists the transition, and serves agents", () =>
    Effect.gen(function* () {
      events.length = 0;
      const monitor = yield* makeResourcePressureMonitor({
        enabled: true,
        sampleIntervalMs: 20_000,
      });
      for (let i = 0; i < 10; i += 1) yield* Effect.yieldNow;
      const report = yield* monitor.report;
      assert.strictEqual(report.enabled, true);
      assert.strictEqual(report.snapshot?.level, "critical");
      assert.strictEqual(report.snapshot?.stopSpawning, true);
      assert.strictEqual(report.recentEvents.length, 1);
      assert.strictEqual(report.recentEvents[0]?.toLevel, "critical");
      assert.strictEqual(report.recentEvents[0]?.topProcessName, "claude");

      assert.strictEqual(report.snapshot?.processDataStale, false);
      assert.strictEqual(report.snapshot?.accumulation?.worktreeThreadCount, 45);

      const payload = buildAgentResourcePressurePayload(report, 31_000);
      assert.deepStrictEqual(Object.keys(payload).toSorted(), [
        "appProper",
        "appSpawned",
        "appTree",
        "enabled",
        "host",
        "level",
        "osLevel",
        "processDataStale",
        "reasons",
        "recentEvents",
        "recommendation",
        "restOfMachineMiB",
        "sampleAgeSeconds",
        "stopSpawning",
        "topProcesses",
        "worktreeThreads",
      ]);
      const full = payload as {
        topProcesses: unknown;
        sampleAgeSeconds: number;
        appSpawned: { rssMiB: number; agentSessions: number; agentSpawnedProcesses: number };
        restOfMachineMiB: number;
      };
      assert.deepStrictEqual(full.topProcesses, [
        { pid: 4242, name: "claude", category: "provider-root", rssMiB: 7168, cpuPercent: 12 },
      ]);
      // TestClock: the sample is stamped at 0, the agent reads at 31 s.
      assert.strictEqual(full.sampleAgeSeconds, 31);
      assert.deepStrictEqual(full.appSpawned, {
        rssMiB: 7168,
        agentSessions: 1,
        agentSpawnedProcesses: 0,
      });
      // used = 16 - 4 = 12 GiB; T3 tree = 7 GiB; the rest of the machine = 5 GiB.
      assert.strictEqual(full.restOfMachineMiB, 5 * 1024);
    }).pipe(Effect.scoped, Effect.provide(stubs)),
  );

  it("agent payload explains disabled and not-yet-sampled states", () => {
    assert.strictEqual(buildAgentResourcePressurePayload(DISABLED_REPORT, 0).enabled, false);
    const pending = buildAgentResourcePressurePayload(
      { enabled: true, snapshot: null, recentEvents: [] },
      0,
    );
    assert.deepStrictEqual(pending, {
      enabled: true,
      message: "No resource sample yet; retry shortly.",
    });
  });

  it.effect("runtime read tool is not enabled when no handler is bound (flag off)", () =>
    Effect.gen(function* () {
      const result = yield* callT3TeamRuntimeReadTool({
        tool: "t3team.runtime.resource_pressure",
        scopeLabel: "for this thread.",
        toolArgs: {},
        runtimeReadTools: {},
      });
      assert.strictEqual(result.isError, true);
    }),
  );
});

const sqlLayer = it.layer(
  ResourcePressureEventRepositoryLive.pipe(Layer.provideMerge(NodeSqliteClient.layerMemory())),
);

sqlLayer("ResourcePressureEventRepository (sqlite)", (it) => {
  it.effect("persists transitions newest-first and prunes beyond retention", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repo = yield* ResourcePressureEventRepository;
      const event = (occurredAt: number): ResourcePressureEventInput => ({
        occurredAt,
        fromLevel: "ok",
        toLevel: "warn",
        availableMemoryBytes: 1,
        totalMemoryBytes: 2,
        appTreeRssBytes: 3,
        reasons: ["host memory 6% available"],
        topProcessName: null,
        topProcessRssBytes: 0,
      });
      for (let index = 0; index < RESOURCE_PRESSURE_EVENT_RETENTION + 2; index += 1) {
        yield* repo.append(event(index));
      }
      const recent = yield* repo.listRecent({ limit: 1_000 });
      assert.strictEqual(recent.length, RESOURCE_PRESSURE_EVENT_RETENTION);
      assert.strictEqual(recent[0]?.occurredAt, RESOURCE_PRESSURE_EVENT_RETENTION + 1);
      assert.deepStrictEqual(recent[0]?.reasons, ["host memory 6% available"]);
      assert.strictEqual(recent[0]?.topProcessName, null);
      // The accumulation COUNT runs against the real projection_threads schema.
      assert.deepStrictEqual(yield* repo.readAccumulation, {
        worktreeThreadCount: 0,
        archivedWorktreeThreadCount: 0,
      });
    }),
  );
});
