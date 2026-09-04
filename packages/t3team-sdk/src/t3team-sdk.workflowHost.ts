/**
 * Host-neutral per-run workflow host.
 *
 * The reusable run loop, journaling, replay, and suspension primitives live
 * in `@runbook/core` and this package's engine (`startWorkflow`,
 * `resumeWorkflow`, `appendResolvedEntry`). This module is the single
 * per-run control surface any host builds on top of them — the t3team
 * server and the nexi portal both consume it — so the
 * launch → settle → resume → fail funnel is implemented exactly once,
 * host-neutrally:
 *
 *   - `start()`   records the run, launches it, settles the outcome
 *   - `resume()`  journales one ask reply and replays to the next suspension,
 *                 guarded against concurrent/duplicate drives and against a
 *                 reply that a dead process already journaled
 *   - `fail()`    host-detected terminal failure through the host's sinks
 *   - `cancel()`  detaches the controller so no later terminal result publishes
 *
 * The funnel's contract lives in `t3team-sdk.workflowHostTypes.ts`;
 * everything host-specific (broker, durable lifecycle, sinks, repair) is
 * injected. No application code appears here.
 */

import { appendResolvedEntry } from "./t3team-sdk.broker.ts";
import { startWorkflow, resumeWorkflow } from "./t3team-sdk.engine.ts";
import type { AbortedResult, SuspendedResult, WorkflowRunResult } from "@runbook/core/engineTypes";
import type {
  CreateWorkflowRunHostConfig,
  WorkflowHostRegistry,
  WorkflowHostRegisteredRun,
  WorkflowLaunchStatus,
  WorkflowRunHost,
} from "./t3team-sdk.workflowHostTypes.ts";

export type {
  CreateWorkflowRunHostConfig,
  WorkflowHostLifecycle,
  WorkflowHostPendingAsk,
  WorkflowHostRegisteredRun,
  WorkflowHostRegistry,
  WorkflowHostSleep,
  WorkflowHostSinks,
  WorkflowLaunchStatus,
  WorkflowRunHost,
} from "./t3team-sdk.workflowHostTypes.ts";

/** Build a fresh in-memory host-neutral registry. */
export function createWorkflowHostRegistry(): WorkflowHostRegistry {
  const runs = new Map<string, WorkflowHostRegisteredRun>();
  const ownerByRun = new Map<string, string>();
  return {
    registerRun: (runId, run) => {
      runs.set(runId, run);
    },
    deleteRun: (runId) => {
      runs.delete(runId);
      ownerByRun.delete(runId);
    },
    getRun: (runId) => runs.get(runId),
    registerOwnership: (runId, owner) => {
      if (owner === undefined) return;
      ownerByRun.set(runId, owner);
    },
  };
}

/**
 * The single per-run control funnel. Both a live launch and a boot-time
 * rehydration drive through this, so a fresh and a restored run resume
 * through identical code.
 */
export function createWorkflowRunHost(config: CreateWorkflowRunHostConfig): WorkflowRunHost {
  const { ref, args, runId, runOptions, registry, lifecycle, sinks } = config;
  const appendReply = config.appendResolved ?? ((opts) =>
    appendResolvedEntry({
      ...(runOptions.store === undefined ? {} : { store: runOptions.store }),
      ...(runOptions.runsRoot === undefined ? {} : { runsRoot: runOptions.runsRoot }),
      runId: opts.runId,
      correlationId: opts.correlationId,
      reply: opts.reply,
    }));

  let cancelled = false;
  let resuming = false;

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

  const start = async (): Promise<WorkflowLaunchStatus> => {
    if (!config.lifecycleAlreadyRunning) await lifecycle?.recordRunning();
    try {
      return await settle(await startWorkflow(ref, args, { ...runOptions, runId }));
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

  const resume = async (correlationId: string, reply: unknown): Promise<void> => {
    if (registry.getRun(runId) === undefined) return;
    if (resuming) return; // a concurrent resume is settling — never double-drive
    resuming = true;
    try {
      // Claim capacity/state before consuming the durable reply. If a stop
      // wins while this wake is queued, recordActive returns false and the
      // unresolved continuation stays intact.
      if ((await lifecycle?.recordActive()) === false) return;
      const wrote = await appendReply({ runId, correlationId, reply });
      if (!wrote) {
        // A prior process journaled the reply then died before settling — the
        // row is stuck. Fail it so the host stops re-arming it forever.
        await lifecycle?.orphanIfSleeping(correlationId);
        return;
      }
      await config.onReplyJournaled?.(correlationId);
      await settle(await resumeWorkflow(runId, ref, args, runOptions));
    } catch (error) {
      if (registry.getRun(runId) === undefined) return;
      if (await repairAttempt(error)) return;
      if (cancelled) return;
      if (registry.getRun(runId) === undefined) return;
      await sinks.onFailed({ phase: "resume", error });
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

  registry.registerRun(runId, { resume, cancel, fail });
  registry.registerOwnership?.(runId, runOptions.launchThreadId);

  return { start, resume, fail, cancel, isCancelled: () => cancelled, settle };
}
