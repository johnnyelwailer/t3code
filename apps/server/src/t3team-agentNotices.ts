/**
 * Agent notices on tool results (experimental, flag `NEXI_FF_RESOURCE_PRESSURE`): after a host tool
 * call, one `[host]` block tells the thread what newly crossed a threshold. Rules: the engine module.
 *
 * @module t3team-agentNotices
 */
import * as Effect from "effect/Effect";

import {
  hostCpuCandidate,
  processCandidates,
  trackHighCpu,
  usageCandidates,
  type NoticeCandidate,
  type NoticeThresholds,
  type OwnedProcess,
} from "./t3team-agentNoticeEngine.ts";
import { createNoticeDebouncer, noticeBlock } from "./t3team-agentNoticeDebounce.ts";
import { attachHostLine } from "./t3team-resourcePressureToolLine.ts";
import type { ProviderCapacityWindow } from "./provider/t3team-providerCapacityWindows.ts";
import {
  burnRateForKey,
  recordUsageSample,
  type ProviderUsageBurn,
} from "./provider/t3team-providerUsageHistory.ts";
import type { T3TeamToolBinding } from "./t3team-toolBroker.ts";

export interface UsageSubject {
  /** "Codex (work)" for the thread's own account, "child Fix login on Claude (team)" for a child. */
  readonly subject: string;
  readonly windows: ReadonlyArray<ProviderCapacityWindow>;
}

export interface AgentNoticeInputs {
  readonly nowMs: Effect.Effect<number>;
  readonly ownUsage: (threadId: string) => Effect.Effect<ReadonlyArray<UsageSubject>>;
  readonly childUsage: (threadId: string) => Effect.Effect<ReadonlyArray<UsageSubject>>;
  readonly ownedProcesses: (threadId: string) => Effect.Effect<ReadonlyArray<OwnedProcess>>;
  readonly hostCpuPercent: Effect.Effect<number | undefined>;
  readonly thresholds: Effect.Effect<NoticeThresholds>;
}

export interface AgentNotices {
  /** The `[host]` block this thread has not been told yet, or null. */
  readonly noteFor: (threadId: string) => Effect.Effect<string | null>;
}

const burnsFor = (
  subjects: ReadonlyArray<UsageSubject>,
  nowMs: number,
): Map<string, ProviderUsageBurn> => {
  const burns = new Map<string, ProviderUsageBurn>();
  for (const { windows } of subjects) {
    for (const window of windows) {
      recordUsageSample(window.sampleKey, window.usedPercent, nowMs);
      const burn = burnRateForKey(window.sampleKey, nowMs);
      if (burn !== undefined) burns.set(window.sampleKey, burn);
    }
  }
  return burns;
};

export const makeAgentNotices = (inputs: AgentNoticeInputs): AgentNotices => {
  const debouncer = createNoticeDebouncer();
  const highCpuSince = new Map<string, Map<string, number>>();

  const noteFor = Effect.fn("AgentNotices.noteFor")(
    function* (threadId: string) {
      const nowMs = yield* inputs.nowMs;
      const thresholds = yield* inputs.thresholds;
      const subjects = [
        ...(yield* inputs.ownUsage(threadId)),
        ...(yield* inputs.childUsage(threadId)),
      ];
      const burns = burnsFor(subjects, nowMs);
      const processes = yield* inputs.ownedProcesses(threadId);
      const tracked = trackHighCpu(
        processes,
        highCpuSince.get(threadId) ?? new Map(),
        nowMs,
        thresholds,
      );
      const hostCpu = yield* inputs.hostCpuPercent;
      const candidates: NoticeCandidate[] = [
        ...subjects.flatMap(({ subject, windows }) =>
          usageCandidates({ subject, windows, burns, nowMs, thresholds }),
        ),
        ...processCandidates(processes, tracked, nowMs, thresholds),
        ...(hostCpu === undefined ? [] : [hostCpuCandidate(hostCpu, thresholds)]),
      ];
      highCpuSince.set(threadId, tracked);
      return noticeBlock(debouncer.take(threadId, candidates, nowMs, thresholds.quietMs));
    },
    Effect.catchCause(() => Effect.succeed(null)),
  );

  return { noteFor };
};

/** Wrap a thread binding so any tool result carries the thread's new notices. */
export function withAgentNotices<B extends T3TeamToolBinding | undefined>(
  binding: B,
  notices: AgentNotices | undefined,
): B {
  if (binding === undefined || notices === undefined) return binding;
  const callTool: T3TeamToolBinding["callTool"] = (input) =>
    binding
      .callTool(input)
      .pipe(
        Effect.flatMap((result) =>
          notices
            .noteFor(binding.threadId)
            .pipe(
              Effect.map((block) =>
                block === null ? result : attachHostLine(result, block, "hostNotices"),
              ),
            ),
        ),
      );
  return { ...binding, callTool };
}
