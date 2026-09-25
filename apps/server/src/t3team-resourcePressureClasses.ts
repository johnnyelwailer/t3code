/**
 * Process-tree classes and lineage for the resource-pressure model (flag
 * `NEXI_FF_RESOURCE_PRESSURE`). Pure: works on one resource-telemetry snapshot.
 *
 * The OOM forensics showed one "7 GB app" was three problems: the app itself
 * growing (server / renderer — needs an app-side cap or recycle; killing it
 * kills the app), agent CLIs the app spawned (stoppable), and memory outside
 * the T3 tree (other tools, Spotlight). The classes keep them apart.
 */
import type {
  ResourcePressureClasses,
  ResourceTelemetryProcess,
  ResourceTelemetryProcessCategory,
  ResourceTelemetrySnapshot,
} from "@t3tools/contracts";

const APP_PROPER: ReadonlySet<ResourceTelemetryProcessCategory> = new Set([
  "server",
  "electron-main",
  "electron-renderer",
  "electron-gpu",
  "electron-utility",
  "resource-monitor",
]);

const AGENT_ROOTS: ReadonlySet<ResourceTelemetryProcessCategory> = new Set([
  "provider-root",
  "terminal-root",
]);

export const isAppProper = (category: ResourceTelemetryProcessCategory): boolean =>
  APP_PROPER.has(category);

/** Guard against malformed ppid cycles; real trees are far shallower. */
const MAX_LINEAGE_DEPTH = 64;

/**
 * Does `pid`'s ppid chain, within this one scan, reach `ancestorPid`? A process
 * whose parent is missing from the scan (re-parented to launchd, or outside the
 * tree) does not count.
 */
export function descendsFrom(
  pid: number,
  ancestorPid: number,
  byPid: ReadonlyMap<number, ResourceTelemetryProcess>,
): boolean {
  let current = byPid.get(pid);
  for (let depth = 0; current && depth < MAX_LINEAGE_DEPTH; depth += 1) {
    if (current.ppid === ancestorPid) return true;
    current = byPid.get(current.ppid);
  }
  return false;
}

export const indexByPid = (
  telemetry: ResourceTelemetrySnapshot,
): ReadonlyMap<number, ResourceTelemetryProcess> =>
  new Map(telemetry.processes.map((entry) => [entry.identity.pid, entry]));

export function bucketByClass(input: {
  readonly telemetry: ResourceTelemetrySnapshot;
  readonly totalMemoryBytes: number;
  readonly availableMemoryBytes: number;
}): ResourcePressureClasses {
  const byPid = indexByPid(input.telemetry);
  const agentRootPids = input.telemetry.processes
    .filter((entry) => AGENT_ROOTS.has(entry.category))
    .map((entry) => entry.identity.pid);
  const classes = {
    appProper: { rssBytes: 0, processCount: 0, serverRssBytes: 0, rendererRssBytes: 0 },
    appSpawned: { rssBytes: 0, processCount: 0, agentSessionCount: 0, agentSpawnedProcessCount: 0 },
  };
  for (const entry of input.telemetry.processes) {
    if (isAppProper(entry.category)) {
      classes.appProper.rssBytes += entry.residentBytes;
      classes.appProper.processCount += 1;
      if (entry.category === "server") classes.appProper.serverRssBytes += entry.residentBytes;
      if (entry.category === "electron-renderer") {
        classes.appProper.rendererRssBytes += entry.residentBytes;
      }
      continue;
    }
    classes.appSpawned.rssBytes += entry.residentBytes;
    classes.appSpawned.processCount += 1;
    if (entry.category === "provider-root") classes.appSpawned.agentSessionCount += 1;
    if (agentRootPids.some((root) => descendsFrom(entry.identity.pid, root, byPid))) {
      classes.appSpawned.agentSpawnedProcessCount += 1;
    }
  }
  const usedBytes = Math.max(0, input.totalMemoryBytes - input.availableMemoryBytes);
  const treeBytes = classes.appProper.rssBytes + classes.appSpawned.rssBytes;
  return { ...classes, restOfMachineBytes: Math.max(0, usedBytes - treeBytes) };
}
