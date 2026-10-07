/**
 * Host-neutral per-run workflow host.
 *
 * Hosts inject their broker, durable lifecycle, and notification sinks; the
 * launch → settle → resume → fail funnel remains shared and host-neutral.
 *
 * The funnel's contract lives in `t3team-sdk.workflowHostTypes.ts`;
 * everything host-specific (broker, durable lifecycle, sinks, repair) is
 * injected. No application code appears here.
 */

import { appendResolvedEntry } from "./t3team-sdk.broker.ts";
import { startWorkflow } from "./t3team-sdk.engine.ts";
import {
  driveOptions,
  redriveWorkflowRunHost,
  resumeWorkflowRunHost,
} from "./t3team-sdk.workflowHostResume.ts";
import type { AbortedResult, SuspendedResult, WorkflowRunResult } from "@runbook/core/engineTypes";
import type {
  CreateWorkflowRunHostConfig,
  WorkflowHostRedriveOptions,
  WorkflowLaunchStatus,
  WorkflowRunHost,
} from "./t3team-sdk.workflowHostTypes.ts";

export type {
  CreateWorkflowRunHostConfig,
  WorkflowHostLifecycle,
  WorkflowHostOfferTarget,
  WorkflowHostPendingAsk,
  WorkflowHostRedriveOptions,
  WorkflowHostRegisteredRun,
  WorkflowHostRegistry,
  WorkflowHostSleep,
  WorkflowHostSinks,
  WorkflowLaunchStatus,
  WorkflowRunHost,
} from "./t3team-sdk.workflowHostTypes.ts";
export { createWorkflowHostRegistry } from "./t3team-sdk.workflowHostRegistry.ts";

/**
 * The single per-run control funnel. Both a live launch and a boot-time
 * rehydration drive through this, so a fresh and a restored run resume
 * through identical code.
 */
export function createWorkflowRunHost(config: CreateWorkflowRunHostConfig): WorkflowRunHost {
  const { ref, args, runId, runOptions, registry, lifecycle, sinks } = config;
  const appendReply =
    config.appendResolved ??
    ((opts) =>
      appendResolvedEntry({
        ...(runOptions.store === undefined ? {} : { store: runOptions.store }),
        ...(runOptions.runsRoot === undefined ? {} : { runsRoot: runOptions.runsRoot }),
        runId: opts.runId,
        correlationId: opts.correlationId,
        reply: opts.reply,
      }));

  let cancelled = false;
  let resuming = false;
  // Every drive of this run that is still settling — start, resume, redrive, offer. Only `offer`
  // reads it: it waits these out where `resume`/`redrive` would be dropped.
  const inFlight = new Set<Promise<unknown>>();
  const tracked = async <T>(work: () => Promise<T>): Promise<T> => {
    const running = work();
    inFlight.add(running);
    try {
      return await running;
    } finally {
      inFlight.delete(running);
    }
  };

  const settle = async (
    result: WorkflowRunResult<unknown> | SuspendedResult | AbortedResult,
  ): Promise<WorkflowLaunchStatus> => {
    if (cancelled) return "suspended";
    if ("suspended" in result) return "suspended"; // parked — the host resumes it later
    if ("aborted" in result) {
      await lifecycle?.recordFailed({
        reason: "Run aborted by host abort signal.",
        step: "abort",
      });
      await sinks.onAborted?.({ reason: "Run aborted by host abort signal." });
      registry.deleteRun(runId);
      return "failed";
    }
    await lifecycle?.recordCompleted();
    if (cancelled) return "suspended";
    await sinks.onCompleted?.(result);
    registry.deleteRun(runId);
    return "completed";
  };

  const repairAttempt = async (error: unknown): Promise<boolean> => {
    const repair = config.repair?.();
    if (repair === undefined) return false;
    return (await repair(error)) ?? false;
  };

  const start = (): Promise<WorkflowLaunchStatus> => tracked(launch);
  const launch = async (): Promise<WorkflowLaunchStatus> => {
    if (!config.lifecycleAlreadyRunning) await lifecycle?.recordRunning();
    try {
      return await settle(await startWorkflow(ref, args, { ...driveOptions(runOptions), runId }));
    } catch (error) {
      if (cancelled) return "suspended";
      if (await repairAttempt(error)) return "completed";
      // A stop may win while the repair runs; and the run may have COMPLETED
      // during repair (settle deletes it from the registry) with only
      // post-completion bookkeeping failing afterwards — a late error must
      // not overwrite the genuine completion.
      if (cancelled) return "suspended";
      if (registry.getRun(runId) === undefined) return "completed";
      await sinks.onFailed({ phase: "launch", error });
      return "failed";
    }
  };

  // One replay drive at a time: a concurrent resume/redrive is settling — never double-drive.
  const exclusive = async (drive: () => Promise<unknown>): Promise<void> => {
    if (registry.getRun(runId) === undefined) return;
    if (resuming) return;
    resuming = true;
    try {
      await tracked(drive);
    } finally {
      resuming = false;
    }
  };
  const funnel = {
    runId,
    ref,
    args,
    runOptions,
    registry,
    lifecycle,
    settle,
    repairAttempt,
    isCancelled: () => cancelled,
    onFailed: sinks.onFailed,
  };

  const resume = (correlationId: string, reply: unknown): Promise<void> =>
    exclusive(() =>
      resumeWorkflowRunHost({
        ...funnel,
        correlationId,
        reply,
        appendReply,
        retryResolvedReply: config.retryResolvedReply,
        onReplyJournaled: config.onReplyJournaled,
      }),
    );

  const redrive = (opts?: WorkflowHostRedriveOptions): Promise<void> =>
    exclusive(() => redriveWorkflowRunHost({ ...funnel, refire: opts?.refire }));

  const offer: WorkflowRunHost["offer"] = async (decide) => {
    // The wait and the claim below must stay in ONE synchronous segment after the last await, or
    // two offers woken by the same settled drive could both claim the slot.
    while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    if (cancelled || registry.getRun(runId) === undefined) return false;
    resuming = true;
    try {
      return await tracked(async () => {
        const target = await decide();
        if (target === undefined) return false;
        return await resumeWorkflowRunHost({
          ...funnel,
          correlationId: target.correlationId,
          reply: target.reply,
          appendReply,
          retryResolvedReply: config.retryResolvedReply,
          onReplyJournaled: config.onReplyJournaled,
        });
      });
    } finally {
      resuming = false;
    }
  };

  const fail = async (error: unknown): Promise<void> => {
    if (cancelled) return;
    if (registry.getRun(runId) === undefined) return;
    await sinks.onFailed({ phase: "host", error });
  };

  const cancel = (): void => {
    cancelled = true;
  };

  registry.registerRun(runId, { resume, redrive, offer, cancel, fail });
  registry.registerOwnership?.(runId, runOptions.launchThreadId);

  return { start, resume, redrive, offer, fail, cancel, isCancelled: () => cancelled, settle };
}
