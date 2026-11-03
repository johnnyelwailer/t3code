/**
 * Pure threshold rules for agent notices (flag `NEXI_FF_RESOURCE_PRESSURE`): each condition becomes
 * a candidate with a level. The debounce that turns candidates into notes is `t3team-agentNoticeDebounce`.
 *
 * @module t3team-agentNoticeEngine
 */
import { describeWindowPace } from "./provider/t3team-providerCapacityPace.ts";
import type { ProviderCapacityWindow } from "./provider/t3team-providerCapacityWindows.ts";
import type { ProviderUsageBurn } from "./provider/t3team-providerUsageHistory.ts";

export type NoticeLevel = "ok" | "warn" | "critical";

export interface NoticeCandidate {
  readonly key: string;
  readonly level: NoticeLevel;
  /** Rate-like number whose growth by half re-notifies; 0 when the condition has none. */
  readonly magnitude: number;
  readonly text: string;
  readonly recoveredText: string;
}

export interface NoticeThresholds {
  readonly usageWarnPercent: number;
  readonly usageCriticalPercent: number;
  readonly processCpuPercent: number;
  readonly processRssWarnBytes: number;
  readonly processRssCriticalBytes: number;
  readonly hostCpuPercent: number;
  readonly quietMs: number;
}

const GIB = 1024 ** 3;

export const DEFAULT_NOTICE_THRESHOLDS: NoticeThresholds = {
  usageWarnPercent: 80,
  usageCriticalPercent: 95,
  processCpuPercent: 80,
  processRssWarnBytes: 2 * GIB,
  processRssCriticalBytes: 4 * GIB,
  hostCpuPercent: 90,
  quietMs: 5 * 60_000,
};

export const PACE_RISE_FACTOR = 1.5;
export const CPU_SUSTAIN_MS = 10_000;

const HOUR_MS = 3_600_000;
const gib = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

const usageLevel = (
  window: ProviderCapacityWindow,
  burn: ProviderUsageBurn | undefined,
  nowMs: number,
  thresholds: NoticeThresholds,
): NoticeLevel => {
  if (window.usedPercent >= thresholds.usageCriticalPercent) return "critical";
  if (window.usedPercent >= thresholds.usageWarnPercent) return "warn";
  const resetMs = window.resetsAt === undefined ? Number.NaN : Date.parse(window.resetsAt);
  if (burn === undefined || !Number.isFinite(resetMs)) return "ok";
  const exhaustsMs = nowMs + ((100 - window.usedPercent) / burn.percentPerHour) * HOUR_MS;
  return exhaustsMs < resetMs ? "warn" : "ok";
};

/** One candidate per window of `subject` ("Codex", or "child <title> on <account>"). */
export const usageCandidates = (input: {
  readonly subject: string;
  readonly windows: ReadonlyArray<ProviderCapacityWindow>;
  readonly burns: ReadonlyMap<string, ProviderUsageBurn>;
  readonly nowMs: number;
  readonly thresholds: NoticeThresholds;
}): NoticeCandidate[] =>
  input.windows.map((window) => {
    const burn = input.burns.get(window.sampleKey);
    const percent = `${Math.round(window.usedPercent)}%`;
    const reset = window.resetsDisplay === undefined ? "" : `, resets ${window.resetsDisplay}`;
    const head = `${input.subject}: ${window.pool} ${percent} used${reset}`;
    return {
      key: `usage:${input.subject}:${window.sampleKey}`,
      level: usageLevel(window, burn, input.nowMs, input.thresholds),
      magnitude: burn?.percentPerHour ?? 0,
      text: `${head} (${describeWindowPace(window, burn, input.nowMs)})`,
      recoveredText: `${head}: no longer near its limit`,
    };
  });

export interface OwnedProcess {
  readonly pid: number;
  readonly startTimeMs: number;
  readonly name: string;
  readonly threadId: string;
  readonly cpuPercent: number;
  readonly residentBytes: number;
}

const ownerPhrase = (process: OwnedProcess): string =>
  `${process.name} (pid ${process.pid}, thread ${process.threadId})`;

/** CPU counts only once it stayed above the threshold for `CPU_SUSTAIN_MS`; RSS counts at once. */
export const processCandidates = (
  processes: ReadonlyArray<OwnedProcess>,
  highCpuSince: ReadonlyMap<string, number>,
  nowMs: number,
  thresholds: NoticeThresholds,
): NoticeCandidate[] =>
  processes.flatMap((process) => {
    const id = `${process.pid}:${process.startTimeMs}`;
    const since = highCpuSince.get(id);
    const sustained = since !== undefined && nowMs - since >= CPU_SUSTAIN_MS;
    const hint = "if it is an idle dev server or watcher, stop it";
    const cpu: NoticeCandidate = {
      key: `proc:${id}:cpu`,
      level: sustained && process.cpuPercent >= thresholds.processCpuPercent ? "warn" : "ok",
      magnitude: process.cpuPercent,
      text: `${ownerPhrase(process)} is using ${Math.round(process.cpuPercent)}% CPU; ${hint}`,
      recoveredText: `${ownerPhrase(process)} CPU is back to normal or it has stopped`,
    };
    const rssLevel: NoticeLevel =
      process.residentBytes >= thresholds.processRssCriticalBytes
        ? "critical"
        : process.residentBytes >= thresholds.processRssWarnBytes
          ? "warn"
          : "ok";
    const rss: NoticeCandidate = {
      key: `proc:${id}:rss`,
      level: rssLevel,
      magnitude: process.residentBytes,
      text: `${ownerPhrase(process)} holds ${gib(process.residentBytes)} of memory; ${hint}`,
      recoveredText: `${ownerPhrase(process)} memory is back to normal or it has stopped`,
    };
    return [cpu, rss];
  });

/** The processes whose CPU is above the threshold now, keeping the time each first crossed it. */
export const trackHighCpu = (
  processes: ReadonlyArray<OwnedProcess>,
  previous: ReadonlyMap<string, number>,
  nowMs: number,
  thresholds: NoticeThresholds,
): Map<string, number> =>
  new Map(
    processes
      .filter((process) => process.cpuPercent >= thresholds.processCpuPercent)
      .map((process) => {
        const id = `${process.pid}:${process.startTimeMs}`;
        return [id, previous.get(id) ?? nowMs] as const;
      }),
  );

export const hostCpuCandidate = (
  cpuPercent: number,
  thresholds: NoticeThresholds,
): NoticeCandidate => ({
  key: "host:cpu",
  level: cpuPercent >= thresholds.hostCpuPercent ? "warn" : "ok",
  magnitude: cpuPercent,
  text: `machine CPU is at ${Math.round(cpuPercent)}%; avoid starting more parallel work`,
  recoveredText: "machine CPU is back to normal",
});
