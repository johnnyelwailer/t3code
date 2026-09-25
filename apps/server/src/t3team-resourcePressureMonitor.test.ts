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
import { PRESSURE_ADVISORY, pressureLine } from "./t3team-resourcePressureToolLine.ts";

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
      // The sampled critical level fed the auto-pause state machine: new turns now hold.
      assert.strictEqual(report.autoPause?.phase, "pausing");
      assert.deepStrictEqual(report.autoPause?.threads, []);
      assert.strictEqual(report.recentEvents.length, 1);
      assert.strictEqual(report.recentEvents[0]?.toLevel, "critical");
      assert.strictEqual(report.recentEvents[0]?.topProcessName, "claude");

      assert.strictEqual(report.snapshot?.processDataStale, false);
      assert.strictEqual(report.snapshot?.accumulation?.worktreeThreadCount, 45);

      const snapshot = report.snapshot!;
      assert.strictEqual(snapshot.topConsumers[0]?.pid, 4242);
      assert.strictEqual(snapshot.classes.appSpawned.agentSessionCount, 1);
      // used = 16 - 4 = 12 GiB; T3 tree = 7 GiB; the rest of the machine = 5 GiB.
      assert.strictEqual(snapshot.classes.restOfMachineBytes, 5 * GIB);
      // What agents see instead of polling: the pushed line on pressure-impacting results.
      assert.strictEqual(
        pressureLine(snapshot),
        "[host] memory pressure: critical · app tree 7.0 GiB · machine: 25% available · " +
          `critical: ${PRESSURE_ADVISORY.critical}`,
      );
    }).pipe(Effect.scoped, Effect.provide(stubs)),
  );

  it.effect("flag off exposes no auto-pause, so the turn gate and tool wrapper are no-ops", () =>
    Effect.gen(function* () {
      const monitor = yield* makeResourcePressureMonitor({
        enabled: false,
        sampleIntervalMs: 20_000,
      });
      assert.strictEqual(monitor.autoPause, undefined);
    }).pipe(Effect.scoped, Effect.provide(stubs)),
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
