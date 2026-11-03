/**
 * Live inputs of `t3team-agentNotices` (flag `NEXI_FF_RESOURCE_PRESSURE`): thread records, the
 * provider registry, the thread's jobs, the cached process scan and host CPU. Unavailable is empty.
 *
 * @module t3team-agentNoticesLive
 */
import { providerUsageLabel, type ProviderJobSummary, type ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ProviderSessionManagerV2 } from "./orchestration-v2/ProviderSessionManager.ts";
import {
  ThreadManagementService,
  type ThreadManagementServiceShape,
} from "./orchestration-v2/ThreadManagementService.ts";
import { HostResources } from "./resourceTelemetry/HostResources.ts";
import { ResourceTelemetry } from "./resourceTelemetry/ResourceTelemetry.ts";
import { capacityFromProvider } from "./provider/t3team-providerCapacityWindows.ts";
import type { ProviderRegistry } from "./provider/ProviderRegistry.ts";
import type { OwnedProcess } from "./t3team-agentNoticeEngine.ts";
import {
  makeAgentNotices,
  type AgentNoticeInputs,
  type AgentNotices,
  type UsageSubject,
} from "./t3team-agentNotices.ts";
import { controlThreadJobs } from "./t3team-providerJobControl.ts";
import { isResourcePressureEnabled } from "./t3team-resourcePressureFlag.ts";

export interface AgentNoticeSources {
  readonly threads: Pick<ThreadManagementServiceShape, "getThreadRecords">;
  readonly providers: Pick<ProviderRegistry["Service"], "getProviders"> | undefined;
  readonly telemetry: Pick<ResourceTelemetry["Service"], "latest"> | undefined;
  readonly hostResources: HostResources["Service"] | undefined;
  readonly listJobs:
    | ((threadId: ThreadId) => Effect.Effect<ReadonlyArray<ProviderJobSummary>>)
    | undefined;
}

const ACTIVE_CHILD = new Set(["pending", "running", "waiting"]);

const makeAgentNoticeInputs = (sources: AgentNoticeSources): AgentNoticeInputs => {
  const nowMs = DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));

  const instanceWindows = Effect.fn("AgentNoticesLive.instanceWindows")(function* (
    instanceId: string,
    subject: string,
  ) {
    if (sources.providers === undefined) return [];
    const now = yield* DateTime.now;
    const providers = yield* sources.providers.getProviders;
    const provider = providers.find((candidate) => candidate.instanceId === instanceId);
    if (provider === undefined) return [];
    const windows = capacityFromProvider(provider, now).windows;
    return windows.length === 0
      ? []
      : [{ subject: subject || providerUsageLabel(provider), windows }];
  });

  const ownUsage = Effect.fn("AgentNoticesLive.ownUsage")(
    function* (threadId: string) {
      const { thread } = yield* sources.threads.getThreadRecords(threadId as ThreadId, []);
      return yield* instanceWindows(thread.providerInstanceId, "");
    },
    Effect.catchCause(() => Effect.succeed([] as ReadonlyArray<UsageSubject>)),
  );

  const childUsage = Effect.fn("AgentNoticesLive.childUsage")(
    function* (threadId: string) {
      const { subagents } = yield* sources.threads.getThreadRecords(threadId as ThreadId, [
        "subagents",
      ]);
      const active = subagents.filter((task) => ACTIVE_CHILD.has(task.status));
      const perChild = yield* Effect.forEach(active, (task) =>
        instanceWindows(task.providerInstanceId, "").pipe(
          Effect.map((subjects) =>
            subjects.map(({ subject, windows }) => ({
              subject: `child ${task.title ?? task.id} on ${subject}`,
              windows,
            })),
          ),
        ),
      );
      return perChild.flat();
    },
    Effect.catchCause(() => Effect.succeed([] as ReadonlyArray<UsageSubject>)),
  );

  const ownedProcesses = Effect.fn("AgentNoticesLive.ownedProcesses")(
    function* (threadId: string) {
      if (sources.listJobs === undefined || sources.telemetry === undefined) return [];
      const jobs = yield* sources.listJobs(threadId as ThreadId);
      const snapshot = yield* sources.telemetry.latest;
      const byPid = new Map(snapshot.processes.map((entry) => [entry.identity.pid, entry]));
      return jobs.flatMap((job): OwnedProcess[] => {
        const entry =
          job.state === "running" && job.pid !== undefined ? byPid.get(job.pid) : undefined;
        return entry === undefined
          ? []
          : [
              {
                pid: entry.identity.pid,
                startTimeMs: entry.identity.startTimeMs,
                name: job.command,
                threadId,
                cpuPercent: entry.cpuPercent,
                residentBytes: entry.residentBytes,
              },
            ];
      });
    },
    Effect.catchCause(() => Effect.succeed([] as ReadonlyArray<OwnedProcess>)),
  );

  const hostCpuPercent: AgentNoticeInputs["hostCpuPercent"] =
    sources.hostResources === undefined
      ? Effect.succeed(undefined)
      : sources.hostResources.read.pipe(
          Effect.map((host) =>
            host.cpuUtilization === null ? undefined : host.cpuUtilization * 100,
          ),
          Effect.catchCause(() => Effect.succeed(undefined)),
        );

  return { nowMs, ownUsage, childUsage, ownedProcesses, hostCpuPercent };
};

/** The notices source, or undefined with the flag off (no reads, no wrapper). */
export const makeLiveAgentNotices = Effect.fn("AgentNoticesLive.make")(function* (
  threads: ThreadManagementServiceShape,
  providers: ProviderRegistry["Service"] | undefined,
) {
  if (!isResourcePressureEnabled()) return undefined;
  const sessions = Option.getOrUndefined(yield* Effect.serviceOption(ProviderSessionManagerV2));
  const listJobs =
    sessions === undefined
      ? undefined
      : (threadId: ThreadId): Effect.Effect<ReadonlyArray<ProviderJobSummary>> =>
          controlThreadJobs({ threadId, request: { kind: "list" } }).pipe(
            Effect.map((result): ReadonlyArray<ProviderJobSummary> =>
              result.kind === "jobs" ? result.jobs : [],
            ),
            Effect.provideService(ThreadManagementService, threads),
            Effect.provideService(ProviderSessionManagerV2, sessions),
            Effect.catchCause(() => Effect.succeed([] as ReadonlyArray<ProviderJobSummary>)),
          );
  const notices: AgentNotices = makeAgentNotices(
    makeAgentNoticeInputs({
      threads,
      providers,
      telemetry: Option.getOrUndefined(yield* Effect.serviceOption(ResourceTelemetry)),
      hostResources: Option.getOrUndefined(yield* Effect.serviceOption(HostResources)),
      listJobs,
    }),
  );
  return notices;
});
