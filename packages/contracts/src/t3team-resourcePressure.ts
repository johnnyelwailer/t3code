/**
 * Resource pressure: a bounded, server-side memory-pressure model over the
 * existing resource telemetry (native `t3-resource-monitor` process tree +
 * host memory). One read answers "how short is this machine on memory, what
 * is eating it, and should agents stop spawning work?" for both the agent
 * tool (`t3team.runtime.resource_pressure`) and the diagnostics settings view.
 *
 * Runtime feature flag: env `NEXI_FF_RESOURCE_PRESSURE` (default off). The
 * server advertises it as `ServerConfig.resourcePressure`; with the flag off
 * there is no sampler, no RPC data and no UI surface.
 */
import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt } from "./baseSchemas.ts";
import { ResourceTelemetryProcessCategory } from "./resourceTelemetry.ts";

export const ResourcePressureLevel = Schema.Literals(["ok", "warn", "critical"]);
export type ResourcePressureLevel = typeof ResourcePressureLevel.Type;

/** macOS kernel verdict (`kern.memorystatus_vm_pressure_level`); null off darwin. */
export const OsMemoryPressureLevel = Schema.Literals(["normal", "warn", "critical"]);
export type OsMemoryPressureLevel = typeof OsMemoryPressureLevel.Type;

export const ResourcePressureConsumer = Schema.Struct({
  pid: PositiveInt,
  startTimeMs: NonNegativeInt,
  ppid: NonNegativeInt,
  name: Schema.String,
  command: Schema.String,
  category: ResourceTelemetryProcessCategory,
  residentBytes: NonNegativeInt,
  cpuPercent: Schema.Number,
  /** True when the server would accept a user-confirmed signal for this identity. */
  signalable: Schema.Boolean,
});
export type ResourcePressureConsumer = typeof ResourcePressureConsumer.Type;

export const ResourcePressureSnapshot = Schema.Struct({
  sampledAt: NonNegativeInt,
  level: ResourcePressureLevel,
  /** Human-readable triggers for the level, e.g. "host memory 6% available". */
  reasons: Schema.Array(Schema.String),
  osLevel: Schema.NullOr(OsMemoryPressureLevel),
  totalMemoryBytes: NonNegativeInt,
  availableMemoryBytes: NonNegativeInt,
  appTreeRssBytes: NonNegativeInt,
  appTreeProcessCount: NonNegativeInt,
  topConsumers: Schema.Array(ResourcePressureConsumer),
  /** Agents should not start new children/workflows/jobs while true. */
  stopSpawning: Schema.Boolean,
  recommendation: Schema.String,
  sampleIntervalMs: PositiveInt,
});
export type ResourcePressureSnapshot = typeof ResourcePressureSnapshot.Type;

/** A persisted level transition (survives restarts). */
export const ResourcePressureEvent = Schema.Struct({
  id: NonNegativeInt,
  occurredAt: NonNegativeInt,
  fromLevel: ResourcePressureLevel,
  toLevel: ResourcePressureLevel,
  availableMemoryBytes: NonNegativeInt,
  totalMemoryBytes: NonNegativeInt,
  appTreeRssBytes: NonNegativeInt,
  reasons: Schema.Array(Schema.String),
  topProcessName: Schema.NullOr(Schema.String),
  topProcessRssBytes: NonNegativeInt,
});
export type ResourcePressureEvent = typeof ResourcePressureEvent.Type;

export const ResourcePressureReport = Schema.Struct({
  enabled: Schema.Boolean,
  /** Null until the first sample completes (or always, when disabled). */
  snapshot: Schema.NullOr(ResourcePressureSnapshot),
  recentEvents: Schema.Array(ResourcePressureEvent),
});
export type ResourcePressureReport = typeof ResourcePressureReport.Type;
