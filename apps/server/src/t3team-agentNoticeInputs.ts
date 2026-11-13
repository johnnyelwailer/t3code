/**
 * Inputs of `t3team-agentNotices` over narrow sources (flag `NEXI_FF_RESOURCE_PRESSURE`); a missing
 * or failing source is empty. The live services are adapted in `t3team-agentNoticesLive`.
 *
 * @module t3team-agentNoticeInputs
 */
import type { ResourcePressureThresholds } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ProviderCapacityWindow } from "./provider/t3team-providerCapacityWindows.ts";
import {
  DEFAULT_NOTICE_THRESHOLDS,
  type NoticeThresholds,
  type OwnedProcess,
} from "./t3team-agentNoticeEngine.ts";
import type { AgentNoticeInputs, UsageSubject } from "./t3team-agentNotices.ts";

export interface ActiveChild {
  readonly id: string;
  readonly title: string | null;
  readonly providerInstanceId: string;
}

export interface InstanceCapacity {
  readonly label: string;
  readonly windows: ReadonlyArray<ProviderCapacityWindow>;
}

export interface RunningJob {
  readonly command: string;
  readonly pid: number;
}

export interface ProcessStats {
  readonly startTimeMs: number;
  readonly cpuPercent: number;
  readonly residentBytes: number;
}

export interface AgentNoticeSources {
  readonly nowMs: Effect.Effect<number>;
  readonly providerInstanceId: (threadId: string) => Effect.Effect<string>;
  readonly activeChildren: (threadId: string) => Effect.Effect<ReadonlyArray<ActiveChild>>;
  readonly instanceCapacity:
    | ((instanceId: string) => Effect.Effect<InstanceCapacity | undefined>)
    | undefined;
  readonly runningJobs:
    | ((threadId: string) => Effect.Effect<ReadonlyArray<RunningJob>>)
    | undefined;
  readonly processStats: Effect.Effect<ReadonlyMap<number, ProcessStats>> | undefined;
  /** Host CPU as a fraction 0..1, or null when the sample has none. */
  readonly hostCpuUtilization: Effect.Effect<number | null> | undefined;
  readonly readSettings: Effect.Effect<ResourcePressureThresholds> | undefined;
}

const GIB = 1024 ** 3;

export const noticeThresholdsFromSettings = (
  settings: ResourcePressureThresholds,
): NoticeThresholds => ({
  usageWarnPercent: settings.noticeUsageWarnPercent,
  usageCriticalPercent: settings.noticeUsageCriticalPercent,
  processCpuPercent: settings.noticeProcessCpuPercent,
  processRssWarnBytes: settings.noticeProcessRssWarnGiB * GIB,
  processRssCriticalBytes: settings.noticeProcessRssCriticalGiB * GIB,
  hostCpuPercent: settings.noticeHostCpuPercent,
  quietMs: settings.noticeQuietMinutes * 60_000,
});

export const makeAgentNoticeInputs = (sources: AgentNoticeSources): AgentNoticeInputs => {
  const noUsage = Effect.succeed<ReadonlyArray<UsageSubject>>([]);

  const capacityOf = Effect.fn("AgentNoticeInputs.capacityOf")(function* (instanceId: string) {
    return sources.instanceCapacity === undefined
      ? undefined
      : yield* sources.instanceCapacity(instanceId);
  });

  const ownUsage = Effect.fn("AgentNoticeInputs.ownUsage")(
    function* (threadId: string) {
      const capacity = yield* capacityOf(yield* sources.providerInstanceId(threadId));
      return capacity === undefined || capacity.windows.length === 0
        ? []
        : [{ subject: capacity.label, windows: capacity.windows }];
    },
    Effect.catchCause(() => noUsage),
  );

  const childUsage = Effect.fn("AgentNoticeInputs.childUsage")(
    function* (threadId: string) {
      const children = yield* sources.activeChildren(threadId);
      const perChild = yield* Effect.forEach(children, (child) =>
        capacityOf(child.providerInstanceId).pipe(
          Effect.map((capacity): ReadonlyArray<UsageSubject> =>
            capacity === undefined || capacity.windows.length === 0
              ? []
              : [
                  {
                    subject: `child ${child.title ?? child.id} on ${capacity.label}`,
                    windows: capacity.windows,
                  },
                ],
          ),
        ),
      );
      return perChild.flat();
    },
    Effect.catchCause(() => noUsage),
  );

  const ownedProcesses = Effect.fn("AgentNoticeInputs.ownedProcesses")(
    function* (threadId: string) {
      if (sources.runningJobs === undefined || sources.processStats === undefined) return [];
      const jobs = yield* sources.runningJobs(threadId);
      const stats = yield* sources.processStats;
      return jobs.flatMap((job): OwnedProcess[] => {
        const entry = stats.get(job.pid);
        return entry === undefined ? [] : [{ pid: job.pid, name: job.command, threadId, ...entry }];
      });
    },
    Effect.catchCause(() => Effect.succeed<ReadonlyArray<OwnedProcess>>([])),
  );

  const hostCpuPercent: AgentNoticeInputs["hostCpuPercent"] =
    sources.hostCpuUtilization === undefined
      ? Effect.succeed(undefined)
      : sources.hostCpuUtilization.pipe(
          Effect.map((fraction) => (fraction === null ? undefined : fraction * 100)),
          Effect.catchCause(() => Effect.succeed(undefined)),
        );

  const thresholds: AgentNoticeInputs["thresholds"] =
    sources.readSettings === undefined
      ? Effect.succeed(DEFAULT_NOTICE_THRESHOLDS)
      : sources.readSettings.pipe(
          Effect.map(noticeThresholdsFromSettings),
          Effect.catchCause(() => Effect.succeed(DEFAULT_NOTICE_THRESHOLDS)),
        );

  return { nowMs: sources.nowMs, ownUsage, childUsage, ownedProcesses, hostCpuPercent, thresholds };
};
