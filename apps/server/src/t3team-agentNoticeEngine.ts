/**
 * Pure threshold and debounce rules for agent notices (flag `NEXI_FF_RESOURCE_PRESSURE`): a note on
 * a level crossing, a recovery, or a burn rate up by half; silence inside the quiet window, except
 * an escalation to critical.
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

export const NOTICE_QUIET_MS = 5 * 60_000;
const PACE_RISE_FACTOR = 1.5;
const USAGE_WARN_PERCENT = 80;
const USAGE_CRITICAL_PERCENT = 95;
const PROCESS_CPU_WARN_PERCENT = 80;
const PROCESS_RSS_WARN_BYTES = 2 * 1024 ** 3;
const PROCESS_RSS_CRITICAL_BYTES = 4 * 1024 ** 3;
const HOST_CPU_WARN_PERCENT = 90;
export const CPU_SUSTAIN_MS = 10_000;

const HOUR_MS = 3_600_000;
const gib = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

const usageLevel = (
  window: ProviderCapacityWindow,
  burn: ProviderUsageBurn | undefined,
  nowMs: number,
): NoticeLevel => {
  if (window.usedPercent >= USAGE_CRITICAL_PERCENT) return "critical";
  if (window.usedPercent >= USAGE_WARN_PERCENT) return "warn";
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
}): NoticeCandidate[] =>
  input.windows.map((window) => {
    const burn = input.burns.get(window.sampleKey);
    const percent = `${Math.round(window.usedPercent)}%`;
    const reset = window.resetsDisplay === undefined ? "" : `, resets ${window.resetsDisplay}`;
    const head = `${input.subject}: ${window.pool} ${percent} used${reset}`;
    return {
      key: `usage:${input.subject}:${window.sampleKey}`,
      level: usageLevel(window, burn, input.nowMs),
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
): NoticeCandidate[] =>
  processes.flatMap((process) => {
    const id = `${process.pid}:${process.startTimeMs}`;
    const since = highCpuSince.get(id);
    const sustained = since !== undefined && nowMs - since >= CPU_SUSTAIN_MS;
    const hint = "if it is an idle dev server or watcher, stop it";
    const cpu: NoticeCandidate = {
      key: `proc:${id}:cpu`,
      level: sustained && process.cpuPercent >= PROCESS_CPU_WARN_PERCENT ? "warn" : "ok",
      magnitude: process.cpuPercent,
      text: `${ownerPhrase(process)} is using ${Math.round(process.cpuPercent)}% CPU; ${hint}`,
      recoveredText: `${ownerPhrase(process)} CPU is back to normal or it has stopped`,
    };
    const rssLevel: NoticeLevel =
      process.residentBytes >= PROCESS_RSS_CRITICAL_BYTES
        ? "critical"
        : process.residentBytes >= PROCESS_RSS_WARN_BYTES
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
): Map<string, number> =>
  new Map(
    processes
      .filter((process) => process.cpuPercent >= PROCESS_CPU_WARN_PERCENT)
      .map((process) => {
        const id = `${process.pid}:${process.startTimeMs}`;
        return [id, previous.get(id) ?? nowMs] as const;
      }),
  );

export const hostCpuCandidate = (cpuPercent: number): NoticeCandidate => ({
  key: "host:cpu",
  level: cpuPercent >= HOST_CPU_WARN_PERCENT ? "warn" : "ok",
  magnitude: cpuPercent,
  text: `machine CPU is at ${Math.round(cpuPercent)}%; avoid starting more parallel work`,
  recoveredText: "machine CPU is back to normal",
});

interface NoticeMemory {
  readonly level: NoticeLevel;
  readonly recoveredText: string;
  readonly magnitude: number;
  readonly notedAtMs: number;
}

const RANK: Record<NoticeLevel, number> = { ok: 0, warn: 1, critical: 2 };

export interface NoticeDebouncer {
  /** The note texts to deliver to `recipient` now; updates what was last told. */
  readonly take: (
    recipient: string,
    candidates: ReadonlyArray<NoticeCandidate>,
    nowMs: number,
  ) => string[];
}

export const createNoticeDebouncer = (quietMs: number = NOTICE_QUIET_MS): NoticeDebouncer => {
  const memory = new Map<string, NoticeMemory>();
  const take: NoticeDebouncer["take"] = (recipient, candidates, nowMs) => {
    const notes: string[] = [];
    for (const candidate of candidates) {
      const id = `${recipient}\u0000${candidate.key}`;
      const last = memory.get(id);
      const lastLevel = last?.level ?? "ok";
      const quiet = last !== undefined && nowMs - last.notedAtMs < quietMs;
      const escalated = RANK[candidate.level] > RANK[lastLevel];
      const toCritical = escalated && candidate.level === "critical";
      const recovered = candidate.level === "ok" && lastLevel !== "ok";
      const paceRose =
        candidate.level !== "ok" &&
        candidate.level === lastLevel &&
        last !== undefined &&
        last.magnitude > 0 &&
        candidate.magnitude >= last.magnitude * PACE_RISE_FACTOR;
      if (recovered) {
        notes.push(candidate.recoveredText);
        memory.set(id, { ...last!, level: "ok", magnitude: 0, notedAtMs: nowMs });
      } else if (toCritical || ((escalated || paceRose) && !quiet)) {
        notes.push(candidate.text);
        memory.set(id, {
          level: candidate.level,
          recoveredText: candidate.recoveredText,
          magnitude: candidate.magnitude,
          notedAtMs: nowMs,
        });
      } else if (last !== undefined && RANK[candidate.level] < RANK[lastLevel]) {
        memory.set(id, { ...last, level: candidate.level });
      }
    }
    const present = new Set(candidates.map((candidate) => `${recipient}\u0000${candidate.key}`));
    for (const [id, last] of memory) {
      if (!id.startsWith(`${recipient}\u0000`) || present.has(id) || last.level === "ok") continue;
      notes.push(last.recoveredText);
      memory.set(id, { ...last, level: "ok", magnitude: 0, notedAtMs: nowMs });
    }
    return notes;
  };
  return { take };
};

export const noticeBlock = (notes: ReadonlyArray<string>): string | null =>
  notes.length === 0 ? null : notes.map((note) => `[host] ${note}`).join("\n");
