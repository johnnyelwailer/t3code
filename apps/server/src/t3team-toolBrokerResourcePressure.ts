/**
 * Broker handler for `t3team.runtime.resource_pressure` (flag
 * `NEXI_FF_RESOURCE_PRESSURE`): one call returns the memory-pressure level,
 * host + T3 app-tree memory, the top consumers and a `stopSpawning`
 * recommendation, so an orchestrating agent can back off before the next OOM.
 *
 * It reads the monitor's latest bounded sample — it never triggers a scan, so
 * agents polling it cannot cause a sampling storm.
 *
 * @module t3team-toolBrokerResourcePressure
 */
import type { ResourcePressureReport } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { okResult } from "./t3team-toolBrokerHelpers.ts";
import type { ResourcePressureMonitorShape } from "./t3team-resourcePressureMonitor.ts";

export const AGENT_TOP_PROCESS_COUNT = 5;
export const AGENT_RECENT_EVENT_COUNT = 5;

const mib = (bytes: number): number => Math.round(bytes / 1024 ** 2);

/** The agent-facing payload: compact, unit-explicit (MiB), no raw telemetry. */
export function buildAgentResourcePressurePayload(report: ResourcePressureReport, nowMs: number) {
  if (!report.enabled) {
    return {
      enabled: false,
      message: "Resource pressure monitoring is disabled on this host (NEXI_FF_RESOURCE_PRESSURE).",
    };
  }
  const snapshot = report.snapshot;
  if (snapshot === null) {
    return { enabled: true, message: "No resource sample yet; retry shortly." };
  }
  return {
    enabled: true,
    level: snapshot.level,
    stopSpawning: snapshot.stopSpawning,
    recommendation: snapshot.recommendation,
    reasons: snapshot.reasons,
    osLevel: snapshot.osLevel,
    sampleAgeSeconds: Math.max(0, Math.round((nowMs - snapshot.sampledAt) / 1000)),
    host: {
      totalMiB: mib(snapshot.totalMemoryBytes),
      availableMiB: mib(snapshot.availableMemoryBytes),
    },
    appTree: { rssMiB: mib(snapshot.appTreeRssBytes), processCount: snapshot.appTreeProcessCount },
    // The app itself vs what it spawned vs everything else on the host.
    appProper: {
      rssMiB: mib(snapshot.classes.appProper.rssBytes),
      serverMiB: mib(snapshot.classes.appProper.serverRssBytes),
      rendererMiB: mib(snapshot.classes.appProper.rendererRssBytes),
    },
    appSpawned: {
      rssMiB: mib(snapshot.classes.appSpawned.rssBytes),
      agentSessions: snapshot.classes.appSpawned.agentSessionCount,
      agentSpawnedProcesses: snapshot.classes.appSpawned.agentSpawnedProcessCount,
    },
    restOfMachineMiB: mib(snapshot.classes.restOfMachineBytes),
    worktreeThreads: snapshot.accumulation?.worktreeThreadCount ?? null,
    processDataStale: snapshot.processDataStale,
    topProcesses: snapshot.topConsumers.slice(0, AGENT_TOP_PROCESS_COUNT).map((consumer) => ({
      pid: consumer.pid,
      name: consumer.name,
      category: consumer.category,
      rssMiB: mib(consumer.residentBytes),
      cpuPercent: Math.round(consumer.cpuPercent),
    })),
    recentEvents: report.recentEvents.slice(0, AGENT_RECENT_EVENT_COUNT).map((event) => ({
      at: DateTime.formatIso(DateTime.makeUnsafe(event.occurredAt)),
      from: event.fromLevel,
      to: event.toLevel,
    })),
  };
}

export const makeReadResourcePressure =
  (monitor: ResourcePressureMonitorShape) =>
  (_toolArgs: unknown): Effect.Effect<T3TeamToolCallResult> =>
    Effect.gen(function* () {
      const report = yield* monitor.report;
      const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
      return okResult({ resourcePressure: buildAgentResourcePressurePayload(report, nowMs) });
    });
