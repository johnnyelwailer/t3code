import type { ResourceTelemetryProcess, ResourceTelemetrySnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyHysteresis,
  buildPressureSnapshot,
  classifyPressure,
  INITIAL_HYSTERESIS,
  parseDarwinPressureLevel,
  RECOMMENDATIONS,
  topConsumers,
} from "./t3team-resourcePressureModel.ts";
import {
  isResourcePressureEnabled,
  resolveResourcePressureIntervalMs,
} from "./t3team-resourcePressureFlag.ts";

const GIB = 1024 ** 3;
const host = (availableGib: number, totalGib = 16) => ({
  totalMemoryBytes: totalGib * GIB,
  availableMemoryBytes: availableGib * GIB,
});

function processEntry(
  pid: number,
  residentBytes: number,
  category: ResourceTelemetryProcess["category"],
): ResourceTelemetryProcess {
  return {
    identity: { pid, startTimeMs: pid * 10 },
    ppid: 1,
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

function telemetry(processes: ReadonlyArray<ResourceTelemetryProcess>): ResourceTelemetrySnapshot {
  const rss = processes.reduce((sum, entry) => sum + entry.residentBytes, 0);
  return {
    processes,
    groups: { allT3: { currentRssBytes: rss, processCount: processes.length } },
  } as unknown as ResourceTelemetrySnapshot;
}

describe("classifyPressure", () => {
  it("is ok with plenty of memory and a small app tree", () => {
    expect(classifyPressure({ host: host(8), osLevel: null, appTreeRssBytes: 1 * GIB }).level).toBe(
      "ok",
    );
  });

  it("applies the non-darwin available-memory thresholds (15% warn, 7% critical)", () => {
    const at = (available: number) =>
      classifyPressure({ host: host(available, 100), osLevel: null, appTreeRssBytes: 0 }).level;
    expect(at(15)).toBe("ok");
    expect(at(14.9)).toBe("warn");
    expect(at(7)).toBe("warn");
    expect(at(6.9)).toBe("critical");
  });

  it("applies the app-tree share thresholds (25% warn, 40% critical)", () => {
    const at = (appGib: number) =>
      classifyPressure({ host: host(50, 100), osLevel: null, appTreeRssBytes: appGib * GIB }).level;
    expect(at(24.9)).toBe("ok");
    expect(at(25)).toBe("warn");
    expect(at(39.9)).toBe("warn");
    expect(at(40)).toBe("critical");
  });

  it("flags the reported 7 GB app on a 16 GB Mac as critical even with a normal kernel verdict", () => {
    const result = classifyPressure({ host: host(4), osLevel: "normal", appTreeRssBytes: 7 * GIB });
    expect(result.level).toBe("critical");
    expect(result.reasons.join(" ")).toContain("T3 app tree uses 7.0 GiB");
  });

  it("trusts the darwin kernel verdict over the vm_stat available estimate", () => {
    // 3% "available" from vm_stat is normal on a healthy Mac (compressor not counted).
    expect(classifyPressure({ host: host(0.5), osLevel: "normal", appTreeRssBytes: 0 }).level).toBe(
      "ok",
    );
    expect(classifyPressure({ host: host(8), osLevel: "warn", appTreeRssBytes: 0 }).level).toBe(
      "warn",
    );
    expect(classifyPressure({ host: host(8), osLevel: "critical", appTreeRssBytes: 0 }).level).toBe(
      "critical",
    );
  });
});

describe("parseDarwinPressureLevel", () => {
  it("maps sysctl kern.memorystatus_vm_pressure_level values", () => {
    expect(parseDarwinPressureLevel("1\n")).toBe("normal");
    expect(parseDarwinPressureLevel("2")).toBe("warn");
    expect(parseDarwinPressureLevel("4")).toBe("critical");
    expect(parseDarwinPressureLevel("")).toBeNull();
    expect(parseDarwinPressureLevel("garbage")).toBeNull();
  });
});

describe("applyHysteresis", () => {
  it("escalates immediately and de-escalates only after two lower samples", () => {
    let state = applyHysteresis(INITIAL_HYSTERESIS, "critical");
    expect(state.level).toBe("critical");
    state = applyHysteresis(state, "ok");
    expect(state.level).toBe("critical");
    state = applyHysteresis(state, "ok");
    expect(state.level).toBe("ok");
  });

  it("resets the lower streak when the level bounces back", () => {
    let state = applyHysteresis(INITIAL_HYSTERESIS, "warn");
    state = applyHysteresis(state, "ok");
    state = applyHysteresis(state, "warn");
    state = applyHysteresis(state, "ok");
    expect(state.level).toBe("warn");
  });
});

describe("topConsumers / buildPressureSnapshot", () => {
  const snapshotTelemetry = telemetry([
    processEntry(10, 1 * GIB, "server"),
    processEntry(11, 5 * GIB, "provider-root"),
    processEntry(12, 2 * GIB, "electron-renderer"),
    processEntry(13, 3 * GIB, "server-child"),
  ]);

  it("orders by RSS and marks only signalable backend descendants (never the server)", () => {
    const top = topConsumers(snapshotTelemetry, 10);
    expect(top.map((entry) => entry.pid)).toEqual([11, 13, 12, 10]);
    expect(top.map((entry) => entry.signalable)).toEqual([true, true, false, false]);
    expect(topConsumers(snapshotTelemetry, 11)[0]?.signalable).toBe(false);
    expect(topConsumers(snapshotTelemetry, 10, 2)).toHaveLength(2);
  });

  it("sets stopSpawning only at critical", () => {
    const build = (level: "ok" | "warn" | "critical") =>
      buildPressureSnapshot({
        sampledAt: 1,
        host: host(8),
        osLevel: null,
        telemetry: snapshotTelemetry,
        level,
        reasons: [],
        serverPid: 10,
        sampleIntervalMs: 20_000,
      });
    expect(build("ok").stopSpawning).toBe(false);
    expect(build("warn").stopSpawning).toBe(false);
    const critical = build("critical");
    expect(critical.stopSpawning).toBe(true);
    expect(critical.recommendation).toBe(RECOMMENDATIONS.critical);
    expect(critical.appTreeRssBytes).toBe(11 * GIB);
    expect(critical.appTreeProcessCount).toBe(4);
  });
});

describe("resource pressure flag", () => {
  it("defaults off and accepts 1/true/on", () => {
    expect(isResourcePressureEnabled(() => undefined)).toBe(false);
    expect(isResourcePressureEnabled(() => "0")).toBe(false);
    expect(isResourcePressureEnabled(() => "yes-sir")).toBe(false);
    expect(isResourcePressureEnabled(() => "1")).toBe(true);
    expect(isResourcePressureEnabled(() => " TRUE ")).toBe(true);
    expect(isResourcePressureEnabled(() => "on")).toBe(true);
  });

  it("clamps the sample period to [10 s, 120 s], default 20 s", () => {
    expect(resolveResourcePressureIntervalMs(() => undefined)).toBe(20_000);
    expect(resolveResourcePressureIntervalMs(() => "abc")).toBe(20_000);
    expect(resolveResourcePressureIntervalMs(() => "500")).toBe(10_000);
    expect(resolveResourcePressureIntervalMs(() => "30000")).toBe(30_000);
    expect(resolveResourcePressureIntervalMs(() => "9999999")).toBe(120_000);
  });
});
