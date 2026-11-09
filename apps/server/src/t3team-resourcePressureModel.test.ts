import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_RESOURCE_PRESSURE_THRESHOLDS } from "@t3tools/contracts";

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
import { processEntry, telemetry } from "./t3team-resourcePressureTestFixtures.ts";

const GIB = 1024 ** 3;
const host = (availableGib: number, totalGib = 16) => ({
  totalMemoryBytes: totalGib * GIB,
  availableMemoryBytes: availableGib * GIB,
});
/** A pressure candidate for `applyHysteresis`; default is not under the available line. */
const cand = (level: "ok" | "warn" | "critical", belowCriticalLine = false) => ({
  level,
  belowCriticalLine,
});

describe("classifyPressure", () => {
  it("is ok with plenty of memory and a small app tree", () => {
    expect(classifyPressure({ host: host(8), osLevel: null, appTreeRssBytes: 1 * GIB }).level).toBe(
      "ok",
    );
  });

  it("uses available GiB scaled to the machine's RAM", () => {
    const at = (available: number) =>
      classifyPressure({ host: host(available, 100), osLevel: null, appTreeRssBytes: 0 }).level;
    expect(at(6)).toBe("ok");
    expect(at(5.9)).toBe("warn");
    expect(at(3)).toBe("warn");
    expect(at(2.9)).toBe("critical");
    expect(classifyPressure({ host: host(1.2, 8), osLevel: null, appTreeRssBytes: 0 }).level).toBe(
      "ok",
    );
    expect(classifyPressure({ host: host(0.79, 8), osLevel: null, appTreeRssBytes: 0 }).level).toBe(
      "critical",
    );
  });

  it("holds warnings inside the recovery margin and clears after two recovered samples", () => {
    const at = (available: number, previousLevel: "ok" | "warn" | "critical") =>
      classifyPressure({
        host: host(available, 64),
        osLevel: null,
        appTreeRssBytes: 0,
        previousLevel,
      }).level;
    expect(at(12.8, "ok")).toBe("ok");
    expect(at(5.9, "ok")).toBe("warn");
    expect(at(2.9, "ok")).toBe("critical");
    expect(at(3.9, "critical")).toBe("critical");
    expect(at(6.9, "warn")).toBe("warn");
    const state = applyHysteresis(
      { level: "warn", lowerStreak: 0, criticalSinceMs: null },
      cand(at(7, "warn")),
      0,
    );
    expect(state.level).toBe("warn");
    expect(applyHysteresis(state, cand(at(7, "warn")), 0).level).toBe("ok");
  });

  it("does not treat process memory consumption as non-darwin host pressure", () => {
    const at = (appGib: number) =>
      classifyPressure({ host: host(50, 100), osLevel: null, appTreeRssBytes: appGib * GIB }).level;
    expect(at(24.9)).toBe("ok");
    expect(at(25)).toBe("ok");
    expect(at(39.9)).toBe("ok");
    expect(at(40)).toBe("ok");
  });

  it("warns about commit headroom even when physical RAM is available", () => {
    const at = (commitGiB: number) =>
      classifyPressure({
        host: { ...host(16, 64), commitHeadroomBytes: commitGiB * GIB },
        osLevel: null,
        appTreeRssBytes: 0,
      });
    expect(at(7).level).toBe("ok");
    expect(at(5).level).toBe("warn");
    expect(at(2).level).toBe("critical");
    expect(at(2).reasons).toContain("host commit headroom 2.0 GiB");
  });

  it("uses configured headroom limits", () => {
    expect(
      classifyPressure({
        host: host(5, 64),
        osLevel: null,
        appTreeRssBytes: 0,
        thresholds: {
          ...DEFAULT_RESOURCE_PRESSURE_THRESHOLDS,
          warningAvailableGiB: 4,
          criticalAvailableGiB: 2,
        },
      }).level,
    ).toBe("ok");
  });

  it("clears the Windows warning from Phil's recorded sample after two healthy readings", () => {
    const candidate = classifyPressure({
      host: { totalMemoryBytes: 68016312320, availableMemoryBytes: 15158763520 },
      osLevel: null,
      appTreeRssBytes: 25078063104,
      darwin: false,
    });
    expect(candidate.level).toBe("ok");
    let state = applyHysteresis(INITIAL_HYSTERESIS, cand("warn"), 0);
    state = applyHysteresis(state, cand(candidate.level), 0);
    expect(state.level).toBe("warn");
    state = applyHysteresis(state, cand(candidate.level), 0);
    expect(state.level).toBe("ok");
  });

  it("pins PJ's exact Windows sample: nominal 5.3 GiB is warn; the 2.2 GiB dip is the honest critical", () => {
    // 63.35 GiB host (his real machine, total 68,016,312,320 B), commit 72/126 GiB -> 54 GiB headroom.
    const total = 68016312320;
    const commit = { commitHeadroomBytes: 54 * GIB, commitLimitBytes: 126 * GIB };
    const of = (availableGib: number) =>
      classifyPressure({
        host: {
          totalMemoryBytes: total,
          availableMemoryBytes: Math.round(availableGib * GIB),
          ...commit,
        },
        osLevel: null,
        appTreeRssBytes: 9 * GIB, // ignored on non-darwin; the physical/commit headroom rule decides.
        darwin: false,
      });
    // The reading PJ quoted. critical=min(3 GiB, 10%*63.35)=3; warn=min(6 GiB, 15%*63.35)=6.
    // 5.3 is above critical and below warn -> warn, never critical.
    expect(of(5.3).level).toBe("warn");
    expect(of(5.3).reasons).toEqual(["host memory 5.3 GiB (8%) available"]);
    // The machine oscillates: his journaled events dip under the 3 GiB line (2.2, 2.8, 2.72 GiB).
    // Those samples ARE honest criticals, which is why the banner keeps saying critical.
    expect(of(2.19).level).toBe("critical");
    expect(of(2.19).reasons).toEqual(["host memory 2.2 GiB (3%) available"]);
    // and it recovers to ok once available clears the warn line (6 GiB).
    expect(of(7.21).level).toBe("ok");
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
    let state = applyHysteresis(INITIAL_HYSTERESIS, cand("critical"), 0);
    expect(state.level).toBe("critical");
    state = applyHysteresis(state, cand("ok"), 1000);
    expect(state.level).toBe("critical");
    state = applyHysteresis(state, cand("ok"), 2000);
    expect(state.level).toBe("ok");
  });

  it("resets the lower streak when the level bounces back", () => {
    let state = applyHysteresis(INITIAL_HYSTERESIS, cand("warn"), 0);
    state = applyHysteresis(state, cand("ok"), 1000);
    state = applyHysteresis(state, cand("warn"), 2000);
    state = applyHysteresis(state, cand("ok"), 3000);
    expect(state.level).toBe("warn");
  });

  it("holds a critical that is only under the available line at warn until it sustains", () => {
    let state = applyHysteresis(INITIAL_HYSTERESIS, cand("critical", true), 0);
    expect(state.level).toBe("warn");
    expect(state.criticalSinceMs).toBe(0);
    state = applyHysteresis(state, cand("critical", true), 59_000);
    expect(state.level).toBe("warn");
    state = applyHysteresis(state, cand("critical", true), 60_000);
    expect(state.level).toBe("critical");
  });

  it("re-arms the sustain timer once available clears the line, then re-dips", () => {
    let state = applyHysteresis(INITIAL_HYSTERESIS, cand("critical", true), 0);
    state = applyHysteresis(state, cand("warn", false), 30_000);
    expect(state.criticalSinceMs).toBeNull();
    state = applyHysteresis(state, cand("critical", true), 90_000);
    expect(state.level).toBe("warn");
    expect(state.criticalSinceMs).toBe(90_000);
    state = applyHysteresis(state, cand("critical", true), 150_000);
    expect(state.level).toBe("critical");
  });
});

describe("topConsumers / buildPressureSnapshot", () => {
  const snapshotTelemetry = telemetry([
    processEntry(10, 1 * GIB, "server", 1),
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

  it("publishes no spawn-refusal flag; critical recommends the turn-boundary pause", () => {
    const build = (level: "ok" | "warn" | "critical") =>
      buildPressureSnapshot({
        sampledAt: 1,
        host: { ...host(8), commitHeadroomBytes: 2 * GIB, commitLimitBytes: 32 * GIB },
        osLevel: null,
        telemetry: snapshotTelemetry,
        level,
        reasons: [],
        serverPid: 10,
        sampleIntervalMs: 20_000,
        accumulation: null,
        processDataStale: false,
      });
    for (const level of ["ok", "warn", "critical"] as const) {
      expect(build(level)).not.toHaveProperty("stopSpawning");
    }
    const critical = build("critical");
    expect(critical.recommendation).toBe(RECOMMENDATIONS.critical);
    expect(critical.recommendation).toContain("held at their next turn boundary");
    expect(critical.appTreeRssBytes).toBe(11 * GIB);
    expect(critical.appTreeProcessCount).toBe(4);
    expect(critical.commitHeadroomBytes).toBe(2 * GIB);
    expect(critical.commitLimitBytes).toBe(32 * GIB);
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
