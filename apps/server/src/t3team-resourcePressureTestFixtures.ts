/** Shared test fixtures for the resource-pressure model tests (not a test file itself). */
import type { ResourceTelemetryProcess, ResourceTelemetrySnapshot } from "@t3tools/contracts";

export function processEntry(
  pid: number,
  residentBytes: number,
  category: ResourceTelemetryProcess["category"],
  ppid = 10,
): ResourceTelemetryProcess {
  return {
    identity: { pid, startTimeMs: pid * 10 },
    ppid,
    childPids: [],
    depth: 1,
    name: `proc-${pid}`,
    command: `/bin/proc-${pid}`,
    status: "Run",
    category,
    cpuPercent: 3,
    residentBytes,
  } as unknown as ResourceTelemetryProcess;
}

export function telemetry(
  processes: ReadonlyArray<ResourceTelemetryProcess>,
): ResourceTelemetrySnapshot {
  const rss = processes.reduce((sum, entry) => sum + entry.residentBytes, 0);
  return {
    processes,
    groups: { allT3: { currentRssBytes: rss, processCount: processes.length } },
  } as unknown as ResourceTelemetrySnapshot;
}
