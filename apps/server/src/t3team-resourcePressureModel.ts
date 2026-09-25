/**
 * Pure pressure classification for the resource-pressure model
 * (flag `NEXI_FF_RESOURCE_PRESSURE`). No I/O: the monitor feeds it one host
 * memory reading, the macOS kernel verdict and one resource-telemetry
 * snapshot, and it returns the level, the reasons and the top consumers.
 *
 * Thresholds (documented contract — tests pin them):
 *
 * | signal                                   | warn        | critical    |
 * |------------------------------------------|-------------|-------------|
 * | macOS `kern.memorystatus_vm_pressure_level` | 2 (warn) | 4 (critical) |
 * | host available / total (non-darwin only) | < 15 %      | < 7 %       |
 * | T3 app-tree RSS / host total             | >= 25 %     | >= 40 %     |
 *
 * On darwin the kernel verdict replaces the available-fraction rule: the
 * `vm_stat` free+inactive+speculative estimate ignores the compressor and
 * reads "low" on a healthy Mac. The app-tree rule applies everywhere — it is
 * the one that would have caught the 7 GB episode on a 16 GB host.
 *
 * Hysteresis: a higher level applies on the first sample; a lower level only
 * after {@link DEESCALATE_SAMPLES} consecutive lower samples, so a level
 * hovering on a threshold does not flood the event journal.
 */
import type {
  OsMemoryPressureLevel,
  ResourcePressureAccumulation,
  ResourcePressureConsumer,
  ResourcePressureLevel,
  ResourcePressureSnapshot,
  ResourceTelemetrySnapshot,
} from "@t3tools/contracts";

import { canSignalCategory } from "./diagnostics/ProcessDiagnostics.ts";
import { bucketByClass, descendsFrom, indexByPid } from "./t3team-resourcePressureClasses.ts";

export const HOST_WARN_AVAILABLE_FRACTION = 0.15;
export const HOST_CRITICAL_AVAILABLE_FRACTION = 0.07;
export const APP_WARN_TOTAL_FRACTION = 0.25;
export const APP_CRITICAL_TOTAL_FRACTION = 0.4;
export const DEESCALATE_SAMPLES = 2;
export const TOP_CONSUMER_COUNT = 8;

const RANK: Record<ResourcePressureLevel, number> = { ok: 0, warn: 1, critical: 2 };

export const RECOMMENDATIONS: Record<ResourcePressureLevel, string> = {
  ok: "Resources are fine; no action needed.",
  warn: "Memory is getting short. Avoid starting parallel children or heavy background jobs; prefer finishing current work first.",
  critical:
    "Memory is critically short. Do not start new children, workflows or background jobs. Let running work finish, or ask the user to stop the top consumers.",
};

export interface HostMemoryReading {
  readonly totalMemoryBytes: number;
  readonly availableMemoryBytes: number;
}

/** Maps `kern.memorystatus_vm_pressure_level` output (1/2/4) to the OS verdict. */
export function parseDarwinPressureLevel(output: string): OsMemoryPressureLevel | null {
  const value = Number(output.trim());
  if (value === 4) return "critical";
  if (value === 2) return "warn";
  if (value === 1) return "normal";
  return null;
}

const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;
const gib = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

/** The instantaneous level and its reasons, before hysteresis. */
export function classifyPressure(input: {
  readonly host: HostMemoryReading;
  readonly osLevel: OsMemoryPressureLevel | null;
  readonly appTreeRssBytes: number;
  /** On darwin the vm_stat fraction is never used, even when the kernel read failed. */
  readonly darwin?: boolean;
}): { readonly level: ResourcePressureLevel; readonly reasons: ReadonlyArray<string> } {
  const reasons: string[] = [];
  let level: ResourcePressureLevel = "ok";
  const raise = (next: ResourcePressureLevel, reason: string) => {
    if (RANK[next] > RANK[level]) level = next;
    reasons.push(reason);
  };
  const total = input.host.totalMemoryBytes;
  if (input.osLevel === "critical") raise("critical", "macOS reports critical memory pressure");
  else if (input.osLevel === "warn") raise("warn", "macOS reports memory pressure (warn)");
  if (input.osLevel === null && input.darwin === true) {
    reasons.push("macOS memory-pressure level unavailable this sample");
  } else if (input.osLevel === null && total > 0) {
    const available = input.host.availableMemoryBytes / total;
    const reason = `host memory ${percent(available)} available`;
    if (available < HOST_CRITICAL_AVAILABLE_FRACTION) raise("critical", reason);
    else if (available < HOST_WARN_AVAILABLE_FRACTION) raise("warn", reason);
  }
  if (total > 0) {
    const share = input.appTreeRssBytes / total;
    const reason = `T3 app tree uses ${gib(input.appTreeRssBytes)} (${percent(share)} of RAM)`;
    if (share >= APP_CRITICAL_TOTAL_FRACTION) raise("critical", reason);
    else if (share >= APP_WARN_TOTAL_FRACTION) raise("warn", reason);
  }
  return { level, reasons };
}

export interface HysteresisState {
  readonly level: ResourcePressureLevel;
  readonly lowerStreak: number;
}

export const INITIAL_HYSTERESIS: HysteresisState = { level: "ok", lowerStreak: 0 };

/** Escalate immediately; de-escalate after DEESCALATE_SAMPLES consecutive lower samples. */
export function applyHysteresis(
  previous: HysteresisState,
  candidate: ResourcePressureLevel,
): HysteresisState {
  if (RANK[candidate] >= RANK[previous.level]) return { level: candidate, lowerStreak: 0 };
  const lowerStreak = previous.lowerStreak + 1;
  return lowerStreak >= DEESCALATE_SAMPLES
    ? { level: candidate, lowerStreak: 0 }
    : { level: previous.level, lowerStreak };
}

/**
 * Largest-RSS processes of the T3 tree. `signalable` requires BOTH the server's
 * signal policy (backend-descendant category) AND a ppid chain in this scan
 * that ends at the server — never a name or pattern.
 */
export function topConsumers(
  telemetry: ResourceTelemetrySnapshot,
  serverPid: number,
  limit: number = TOP_CONSUMER_COUNT,
): ReadonlyArray<ResourcePressureConsumer> {
  const byPid = indexByPid(telemetry);
  return [...telemetry.processes]
    .sort((left, right) => right.residentBytes - left.residentBytes)
    .slice(0, limit)
    .map((entry) => ({
      pid: entry.identity.pid,
      startTimeMs: entry.identity.startTimeMs,
      ppid: entry.ppid,
      name: entry.name,
      command: entry.command,
      category: entry.category,
      residentBytes: entry.residentBytes,
      cpuPercent: entry.cpuPercent,
      signalable:
        entry.identity.pid !== serverPid &&
        canSignalCategory(entry.category) &&
        descendsFrom(entry.identity.pid, serverPid, byPid),
    }));
}

/** Assemble the published snapshot for one sample. */
export function buildPressureSnapshot(input: {
  readonly sampledAt: number;
  readonly host: HostMemoryReading;
  readonly osLevel: OsMemoryPressureLevel | null;
  readonly telemetry: ResourceTelemetrySnapshot;
  readonly level: ResourcePressureLevel;
  readonly reasons: ReadonlyArray<string>;
  readonly serverPid: number;
  readonly sampleIntervalMs: number;
  readonly accumulation: ResourcePressureAccumulation | null;
  readonly processDataStale: boolean;
}): ResourcePressureSnapshot {
  return {
    sampledAt: input.sampledAt,
    level: input.level,
    reasons: input.reasons,
    osLevel: input.osLevel,
    totalMemoryBytes: input.host.totalMemoryBytes,
    availableMemoryBytes: input.host.availableMemoryBytes,
    appTreeRssBytes: input.telemetry.groups.allT3.currentRssBytes,
    appTreeProcessCount: input.telemetry.groups.allT3.processCount,
    classes: bucketByClass({ telemetry: input.telemetry, ...input.host }),
    accumulation: input.accumulation,
    processDataStale: input.processDataStale,
    topConsumers: topConsumers(input.telemetry, input.serverPid),
    stopSpawning: input.level === "critical",
    recommendation: RECOMMENDATIONS[input.level],
    sampleIntervalMs: input.sampleIntervalMs,
  };
}
