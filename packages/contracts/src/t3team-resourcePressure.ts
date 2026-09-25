/**
 * Resource pressure: a bounded, server-side memory-pressure model over the
 * existing resource telemetry (native `t3-resource-monitor` process tree +
 * host memory). One read answers "how short is this machine on memory, what
 * is eating it, and which threads are paused for it?" for the diagnostics
 * settings view. Agents never poll it: the host pushes a compact pressure line
 * into pressure-impacting tool results and a one-time note into the next turn.
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
  /**
   * True only when the server would accept a user-confirmed signal for this
   * identity AND its ppid chain in the same scan ends at this server process.
   */
  signalable: Schema.Boolean,
});
export type ResourcePressureConsumer = typeof ResourcePressureConsumer.Type;

/**
 * RSS bucketed by process-tree class — a 7 GB "app" is usually several
 * problems. `appProper` = the app itself (server, Electron main/renderer/GPU/
 * utility, resource monitor): growth here needs an app-side cap/recycle, not a
 * kill. `appSpawned` = descendants the server launched (agent CLIs, terminals,
 * jobs): the stoppable part. `restOfMachineBytes` = host used memory outside
 * the T3 tree (other apps, other agent tools, Spotlight); the tree scan cannot
 * attribute it further.
 */
export const ResourcePressureClasses = Schema.Struct({
  appProper: Schema.Struct({
    rssBytes: NonNegativeInt,
    processCount: NonNegativeInt,
    serverRssBytes: NonNegativeInt,
    rendererRssBytes: NonNegativeInt,
  }),
  appSpawned: Schema.Struct({
    rssBytes: NonNegativeInt,
    processCount: NonNegativeInt,
    /** Provider CLI roots (one per live agent session). */
    agentSessionCount: NonNegativeInt,
    /** Processes below an agent CLI or terminal root (its tools, builds, jobs). */
    agentSpawnedProcessCount: NonNegativeInt,
  }),
  restOfMachineBytes: NonNegativeInt,
});
export type ResourcePressureClasses = typeof ResourcePressureClasses.Type;

/** Disk-side accumulation that grows host pressure (Spotlight, file watchers). */
export const ResourcePressureAccumulation = Schema.Struct({
  /** Live (non-deleted) threads that own a worktree. */
  worktreeThreadCount: NonNegativeInt,
  /** Of those, archived threads — what a storage sweep can reclaim under the cleanup rules. */
  archivedWorktreeThreadCount: NonNegativeInt,
});
export type ResourcePressureAccumulation = typeof ResourcePressureAccumulation.Type;

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
  classes: ResourcePressureClasses,
  accumulation: Schema.NullOr(ResourcePressureAccumulation),
  /** True when the process scan failed and the last telemetry snapshot was reused. */
  processDataStale: Schema.Boolean,
  topConsumers: Schema.Array(ResourcePressureConsumer),
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

/** A thread whose turns the host holds at a turn boundary while pressure is critical. */
export const ResourcePressurePausedThread = Schema.Struct({
  threadId: Schema.String,
  pausedAt: NonNegativeInt,
  /** Turn starts held for this thread since it paused. */
  heldTurnCount: NonNegativeInt,
});
export type ResourcePressurePausedThread = typeof ResourcePressurePausedThread.Type;

/**
 * Auto-pause state machine: `running` (turns start normally) → `pausing`
 * (critical: new turn starts are held) → `cooldown` (below critical, held
 * turns wait out the cooldown window) → `running` (held turns resume).
 */
export const ResourcePressureAutoPausePhase = Schema.Literals(["running", "pausing", "cooldown"]);
export type ResourcePressureAutoPausePhase = typeof ResourcePressureAutoPausePhase.Type;

export const ResourcePressureAutoPauseView = Schema.Struct({
  phase: ResourcePressureAutoPausePhase,
  cooldownMs: PositiveInt,
  /** When the cooldown ends and held turns resume; null outside `cooldown`. */
  resumesAt: Schema.NullOr(NonNegativeInt),
  threads: Schema.Array(ResourcePressurePausedThread),
});
export type ResourcePressureAutoPauseView = typeof ResourcePressureAutoPauseView.Type;

export const ResourcePressureReport = Schema.Struct({
  enabled: Schema.Boolean,
  /** Null until the first sample completes (or always, when disabled). */
  snapshot: Schema.NullOr(ResourcePressureSnapshot),
  recentEvents: Schema.Array(ResourcePressureEvent),
  /** Absent when disabled. */
  autoPause: Schema.optionalKey(ResourcePressureAutoPauseView),
});
export type ResourcePressureReport = typeof ResourcePressureReport.Type;

export const ResourcePressureSweepResult = Schema.Struct({
  /** False when the flag is off; the sweep did not run. */
  swept: Schema.Boolean,
  message: Schema.String,
});
export type ResourcePressureSweepResult = typeof ResourcePressureSweepResult.Type;
