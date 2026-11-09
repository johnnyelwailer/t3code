/**
 * Adapts the live services to `t3team-agentNoticeInputs` (flag `NEXI_FF_RESOURCE_PRESSURE`): thread
 * records, the provider registry, the thread's jobs, the cached process scan, host CPU and the
 * settings. Only live instance windows are read; CLIProxyAPI hub accounts are not tied to a thread.
 *
 * @module t3team-agentNoticesLive
 */
import { providerUsageLabel, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ProviderSessionManagerV2 } from "./orchestration-v2/ProviderSessionManager.ts";
import {
  ThreadManagementService,
  type ThreadManagementServiceShape,
} from "./orchestration-v2/ThreadManagementService.ts";
import type { ProviderRegistry } from "./provider/ProviderRegistry.ts";
import { capacityFromProvider } from "./provider/t3team-providerCapacityWindows.ts";
import { HostResources } from "./resourceTelemetry/HostResources.ts";
import { ResourceTelemetry } from "./resourceTelemetry/ResourceTelemetry.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { makeAgentNoticeInputs, type AgentNoticeSources } from "./t3team-agentNoticeInputs.ts";
import { makeAgentNotices, type AgentNotices } from "./t3team-agentNotices.ts";
import { controlThreadJobs } from "./t3team-providerJobControl.ts";
import { isResourcePressureEnabled } from "./t3team-resourcePressureFlag.ts";

const ACTIVE_CHILD = new Set(["pending", "running", "waiting"]);

/** The notices source, or undefined with the flag off (no reads, no wrapper). */
export const makeLiveAgentNotices = Effect.fn("AgentNoticesLive.make")(function* (
  threads: ThreadManagementServiceShape,
  providers: ProviderRegistry["Service"] | undefined,
) {
  if (!isResourcePressureEnabled()) return undefined;
  const sessions = Option.getOrUndefined(yield* Effect.serviceOption(ProviderSessionManagerV2));
  const telemetry = Option.getOrUndefined(yield* Effect.serviceOption(ResourceTelemetry));
  const host = Option.getOrUndefined(yield* Effect.serviceOption(HostResources));
  const settings = Option.getOrUndefined(yield* Effect.serviceOption(ServerSettingsService));

  const sources: AgentNoticeSources = {
    nowMs: DateTime.now.pipe(Effect.map(DateTime.toEpochMillis)),
    providerInstanceId: (threadId) =>
      threads.getThreadRecords(ThreadId.make(threadId), []).pipe(
        Effect.map(({ thread }) => thread.providerInstanceId),
        Effect.orDie,
      ),
    activeChildren: (threadId) =>
      threads.getThreadRecords(ThreadId.make(threadId), ["subagents"]).pipe(
        Effect.map(({ subagents }) =>
          subagents
            .filter((task) => ACTIVE_CHILD.has(task.status))
            .map((task) => ({
              id: task.id,
              title: task.title,
              providerInstanceId: task.providerInstanceId,
            })),
        ),
        Effect.orDie,
      ),
    instanceCapacity:
      providers === undefined
        ? undefined
        : (instanceId) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now;
              const all = yield* providers.getProviders;
              const provider = all.find((candidate) => candidate.instanceId === instanceId);
              return provider === undefined
                ? undefined
                : {
                    label: providerUsageLabel(provider),
                    windows: capacityFromProvider(provider, now).windows,
                  };
            }),
    runningJobs:
      sessions === undefined
        ? undefined
        : (threadId) =>
            controlThreadJobs({
              threadId: ThreadId.make(threadId),
              request: { kind: "list" },
            }).pipe(
              Effect.map((result) =>
                result.kind === "jobs"
                  ? result.jobs.flatMap((job) =>
                      job.state === "running" && job.pid !== undefined
                        ? [{ command: job.command, pid: job.pid }]
                        : [],
                    )
                  : [],
              ),
              Effect.provideService(ThreadManagementService, threads),
              Effect.provideService(ProviderSessionManagerV2, sessions),
              Effect.orDie,
            ),
    processStats:
      telemetry === undefined
        ? undefined
        : telemetry.latest.pipe(
            Effect.map(
              (snapshot) =>
                new Map(
                  snapshot.processes.map((entry) => [
                    entry.identity.pid,
                    {
                      startTimeMs: entry.identity.startTimeMs,
                      cpuPercent: entry.cpuPercent,
                      residentBytes: entry.residentBytes,
                    },
                  ]),
                ),
            ),
          ),
    hostCpuUtilization:
      host === undefined
        ? undefined
        : host.read.pipe(Effect.map((sample) => sample.cpuUtilization)),
    readSettings:
      settings === undefined
        ? undefined
        : settings.getSettings.pipe(
            Effect.map((value) => value.resourcePressureThresholds),
            Effect.orDie,
          ),
  };
  const notices: AgentNotices = makeAgentNotices(makeAgentNoticeInputs(sources));
  return notices;
});
