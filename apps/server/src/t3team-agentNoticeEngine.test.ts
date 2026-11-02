import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  createNoticeDebouncer,
  CPU_SUSTAIN_MS,
  hostCpuCandidate,
  NOTICE_QUIET_MS,
  noticeBlock,
  processCandidates,
  trackHighCpu,
  usageCandidates,
  type NoticeCandidate,
  type OwnedProcess,
} from "./t3team-agentNoticeEngine.ts";
import type { ProviderCapacityWindow } from "./provider/t3team-providerCapacityWindows.ts";
import type { ProviderUsageBurn } from "./provider/t3team-providerUsageHistory.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const HOUR = 3_600_000;

const window = (usedPercent: number, resetsInHours = 4): ProviderCapacityWindow => ({
  sampleKey: "codex:primary",
  kind: "session",
  pool: "5h session",
  usedPercent,
  resetsAt: DateTime.formatIso(DateTime.makeUnsafe(NOW + resetsInHours * HOUR)),
  resetsDisplay: "16:00 UTC",
  severity: "normal",
});

const burn = (percentPerHour: number): ProviderUsageBurn => ({
  percentPerHour,
  sampleSpanMinutes: 30,
  sampleCount: 4,
});

const usage = (usedPercent: number, perHour?: number, resetsInHours?: number) =>
  usageCandidates({
    subject: "Codex",
    windows: [window(usedPercent, resetsInHours)],
    burns: new Map(perHour === undefined ? [] : [["codex:primary", burn(perHour)]]),
    nowMs: NOW,
  })[0]!;

const levelOf = (candidate: NoticeCandidate) => candidate.level;

describe("usage thresholds", () => {
  it("stays ok below 80% with no burn", () => {
    expect(levelOf(usage(79))).toBe("ok");
  });
  it("warns at 80% and is critical at 95%", () => {
    expect(levelOf(usage(80))).toBe("warn");
    expect(levelOf(usage(94.9))).toBe("warn");
    expect(levelOf(usage(95))).toBe("critical");
  });
  it("warns when the current pace exhausts the window before its reset", () => {
    expect(levelOf(usage(50, 20, 4))).toBe("warn");
    expect(levelOf(usage(50, 10, 4))).toBe("ok");
  });
  it("names the account, window and numbers", () => {
    expect(usage(82).text).toContain("Codex: 5h session 82% used, resets 16:00 UTC");
  });
});

describe("process thresholds", () => {
  const proc = (cpuPercent: number, residentBytes: number): OwnedProcess => ({
    pid: 4242,
    startTimeMs: 1,
    name: "vite",
    threadId: "thread-a",
    cpuPercent,
    residentBytes,
  });
  const GIB = 1024 ** 3;

  it("needs CPU above the threshold for the sustain period", () => {
    const first = trackHighCpu([proc(95, GIB)], new Map(), NOW);
    expect(processCandidates([proc(95, GIB)], first, NOW)[0]!.level).toBe("ok");
    const later = trackHighCpu([proc(95, GIB)], first, NOW + CPU_SUSTAIN_MS);
    expect(processCandidates([proc(95, GIB)], later, NOW + CPU_SUSTAIN_MS)[0]!.level).toBe("warn");
  });
  it("forgets a process whose CPU dropped", () => {
    const first = trackHighCpu([proc(95, GIB)], new Map(), NOW);
    expect(trackHighCpu([proc(10, GIB)], first, NOW + 1).size).toBe(0);
  });
  it("warns at 2 GiB and is critical at 4 GiB resident", () => {
    expect(processCandidates([proc(1, 2 * GIB - 1)], new Map(), NOW)[1]!.level).toBe("ok");
    expect(processCandidates([proc(1, 2 * GIB)], new Map(), NOW)[1]!.level).toBe("warn");
    expect(processCandidates([proc(1, 4 * GIB)], new Map(), NOW)[1]!.level).toBe("critical");
  });
  it("names the process, its thread and the numbers with a hint", () => {
    const text = processCandidates([proc(1, 3 * GIB)], new Map(), NOW)[1]!.text;
    expect(text).toBe(
      "vite (pid 4242, thread thread-a) holds 3.0 GiB of memory; if it is an idle dev server or watcher, stop it",
    );
  });
  it("flags host CPU at 90%", () => {
    expect(hostCpuCandidate(89).level).toBe("ok");
    expect(hostCpuCandidate(90).level).toBe("warn");
  });
});

describe("debounce", () => {
  const candidate = (level: NoticeCandidate["level"], magnitude = 0): NoticeCandidate => ({
    key: "k",
    level,
    magnitude,
    text: `at ${level}`,
    recoveredText: "recovered",
  });

  it("notes a crossing once, then stays quiet while the level holds", () => {
    const debouncer = createNoticeDebouncer();
    expect(debouncer.take("a", [candidate("warn")], NOW)).toEqual(["at warn"]);
    expect(debouncer.take("a", [candidate("warn")], NOW + 1_000)).toEqual([]);
    expect(debouncer.take("a", [candidate("warn")], NOW + 10 * NOTICE_QUIET_MS)).toEqual([]);
  });
  it("lets an escalation to critical through inside the quiet window", () => {
    const debouncer = createNoticeDebouncer();
    debouncer.take("a", [candidate("warn")], NOW);
    expect(debouncer.take("a", [candidate("critical")], NOW + 1_000)).toEqual(["at critical"]);
  });
  it("notes a recovery once", () => {
    const debouncer = createNoticeDebouncer();
    debouncer.take("a", [candidate("warn")], NOW);
    expect(debouncer.take("a", [candidate("ok")], NOW + 1_000)).toEqual(["recovered"]);
    expect(debouncer.take("a", [candidate("ok")], NOW + 2_000)).toEqual([]);
  });
  it("notes a recovery when the condition disappears from the candidates", () => {
    const debouncer = createNoticeDebouncer();
    debouncer.take("a", [candidate("warn")], NOW);
    expect(debouncer.take("a", [], NOW + 1_000)).toEqual(["recovered"]);
    expect(debouncer.take("a", [], NOW + 2_000)).toEqual([]);
    expect(debouncer.take("b", [], NOW + 3_000)).toEqual([]);
  });
  it("holds back a warn crossing that flaps inside the quiet window, then notes it", () => {
    const debouncer = createNoticeDebouncer();
    debouncer.take("a", [candidate("warn")], NOW);
    debouncer.take("a", [candidate("ok")], NOW + 1_000);
    expect(debouncer.take("a", [candidate("warn")], NOW + 2_000)).toEqual([]);
    expect(debouncer.take("a", [candidate("warn")], NOW + NOTICE_QUIET_MS + 2_000)).toEqual([
      "at warn",
    ]);
  });
  it("renotes when the burn rate rose by half, after the quiet window", () => {
    const debouncer = createNoticeDebouncer();
    debouncer.take("a", [candidate("warn", 10)], NOW);
    expect(debouncer.take("a", [candidate("warn", 14)], NOW + NOTICE_QUIET_MS)).toEqual([]);
    expect(debouncer.take("a", [candidate("warn", 15)], NOW + NOTICE_QUIET_MS)).toEqual([
      "at warn",
    ]);
    expect(debouncer.take("a", [candidate("warn", 30)], NOW + NOTICE_QUIET_MS + 1_000)).toEqual([]);
  });
  it("tracks each recipient on its own", () => {
    const debouncer = createNoticeDebouncer();
    expect(debouncer.take("a", [candidate("warn")], NOW)).toHaveLength(1);
    expect(debouncer.take("b", [candidate("warn")], NOW)).toHaveLength(1);
  });
  it("de-escalating from critical to warn stays silent but remembers the level", () => {
    const debouncer = createNoticeDebouncer();
    debouncer.take("a", [candidate("critical")], NOW);
    expect(debouncer.take("a", [candidate("warn")], NOW + 1_000)).toEqual([]);
    expect(debouncer.take("a", [candidate("critical")], NOW + 2_000)).toEqual(["at critical"]);
  });
});

describe("noticeBlock", () => {
  it("is null without notes and prefixes each note otherwise", () => {
    expect(noticeBlock([])).toBeNull();
    expect(noticeBlock(["a", "b"])).toBe("[host] a\n[host] b");
  });
});
