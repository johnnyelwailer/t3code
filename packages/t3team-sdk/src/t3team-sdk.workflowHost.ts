/**
 * Host-neutral per-run workflow host.
 *
 * The reusable run loop, journaling, replay, and suspension primitives live in
 * `@runbook/core` and this package's engine (`startWorkflow`, `resumeWorkflow`,
 * `appendResolvedEntry`). This module is the single per-run control surface any
 * host builds on top of them — the t3team server and the nexi portal both
 * consume it — so the launch → settle → resume → fail funnel is implemented
 * exactly once, host-neutrally:
 *
 *   - `start()`   records the run, launches it, settles the outcome
 *   - `resume()`  journales one ask reply and replays to the next suspension,
 *                 guarded against concurrent/duplicate drives and against a
 *                 reply that a dead process already journaled
 *   - `fail()`    host-detected terminal failure through the host's sinks
 *   - `cancel()`  detaches the controller so no later terminal result publishes
 *
 * Everything host-specific is injected: the broker (in `runOptions`), the
 * durable run-row lifecycle, completion/failure notification sinks, and an
 * optional bounded self-repair attempt. No application code appears here.
 */

import { appendResolvedEntry } from "./t3team-sdk.broker.ts";
import type { WorkflowRef, WorkflowRunOptions } from "./t3team-sdk.types.ts";
import { startWorkflow, resumeWorkflow } from "./t3team-sdk.engine.ts";
import type { AbortedResult, SuspendedResult, WorkflowRunResult } from "@runbook/core/engineTypes";

/** One ask a run is parked on. `payload` is host-defined (the t3team server
 * stores its thread ask; a portal stores the parked record state). */
export interface WorkflowHostPendingAsk {
  readonly correlationId: string;
  readonly payload: unknown;
}

/** One clock park (`waitUntil`): the correlation the scheduler resolves plus
 * the wake deadline in epoch milliseconds. */
export interface WorkflowHostSleep {
  readonly correlationId: string;
  readonly deadline: number;
}

/**
 * Durable run-row observations. The host drives the terminal transitions and
 * the active claim; a host broker also calls `recordSuspended`/`recordSleeping`
 * when it parks a run. Implementations write through to the host's source of
 * truth (DB); an absent lifecycle means a purely in-memory run.
 */
export interface WorkflowHostLifecycle {
  /** Insert the initial running row (once, at launch). */
  readonly recordRunning: () => Promise<void>;
  /** Claim the parked continuation for execution; `false` means the queued run
   * was cancelled and the continuation must stay intact. */
  readonly recordActive: () => Promise<boolean>;
  /** Yield after one live primitive so another run may take the next turn. */
  readonly releaseActive: () => void;
  /** Flip to suspended + record the ask the run parked on. */
  readonly recordSuspended: (pending: WorkflowHostPendingAsk) => Promise<void>;
  /** Flip to sleeping + record the wake deadline the run parked on. */
  readonly recordSleeping: (sleep: WorkflowHostSleep) => Promise<void>;
  /** Mark the run completed and clear the pending ask. */
  readonly recordCompleted: () => Promise<void>;
  /** Mark the run failed, clear the pending ask, persist the reason. */
  readonly recordFailed: (detail: { readonly reason: string; readonly step?: string }) => Promise<void>;
  /** A reply was journaled but no live resume exists: fail the stuck sleeping
   * row so a scheduler stops re-arming it. */
  readonly orphanIfSleeping: (correlationId: string) => Promise<void>;
}

/** The per-run handle a host registry keeps so a parked run can be resumed
 * from whichever host surface the reply (or wake) arrives on. */
export interface WorkflowHostRegisteredRun {
  readonly resume: (correlationId: string, reply: unknown) => Promise<void>;
  readonly cancel: () => void;
  /** Optional: fail from the HOST side for a condition the body can never
   * observe (an ask that will never be answered). */
  readonly fail?: (error: unknown) => Promise<void>;
}

/** Minimal host-neutral run registry. Hosts that key additional indexes (the
 * t3team server also keys pending asks by thread) layer their own structure
 * over these calls. */
export interface WorkflowHostRegistry {
  readonly registerRun: (runId: string, run: WorkflowHostRegisteredRun) => void;
  readonly deleteRun: (runId: string) => void;
  readonly getRun: (runId: string) => WorkflowHostRegisteredRun | undefined;
  readonly registerOwnership?: (runId: string, owner: string | undefined) => void;
}

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

/** Terminal outcome of a host `start()` or settled replay. */
export type WorkflowLaunchStatus = "completed" | "failed" | "suspended";

/**
 * Host notification sinks. Kept as plain callbacks so a host wires exactly
 * what it owns: the t3team server posts thread completion/failure activities;
 * a portal writes durable rows and thread events.
 */
export interface WorkflowHostSinks {
  /** The run genuinely completed (after `recordCompleted`). */
  readonly onCompleted?: (result: WorkflowRunResult<unknown>) => Promise<void>;
  /** A terminal failure: the body threw at launch, a replay failed at resume,
   * or the host detected an ask that can never be answered. */
  readonly onFailed: (detail: {
    readonly phase: "launch" | "resume" | "host";
    readonly error: unknown;
  }) => Promise<void>;
  /** A hard abort (the host abort signal won). */
  readonly onAborted?: (detail: { readonly reason: string }) => Promise<void>;
}

export interface WorkflowRunHost {
  readonly start: () => Promise<WorkflowLaunchStatus>;
  readonly resume: (correlationId: string, reply: unknown) => Promise<void>;
  readonly fail: (error: unknown) => Promise<void>;
  readonly cancel: () => void;
  readonly isCancelled: () => boolean;
  /** Settle one engine outcome (used by a host repair that resumes directly). */
  readonly settle: (
    result: WorkflowRunResult<unknown> | SuspendedResult | AbortedResult,
  ) => Promise<WorkflowLaunchStatus>;
}

export interface CreateWorkflowRunHostConfig {
  readonly ref: WorkflowRef;
  readonly args: unknown;
  readonly runId: string;
  readonly runOptions: WorkflowRunOptions;
  readonly registry: WorkflowHostRegistry;
  readonly lifecycle?: WorkflowHostLifecycle;
  readonly sinks: WorkflowHostSinks;
  /** Optional bounded self-repair at every execution boundary. Resolved
   * lazily so a host can wire it against the host it is building. */
  readonly repair?: () => ((error: unknown) => Promise<boolean>) | undefined;
  /** Reply-journal seam (injectable for tests). Defaults to the SDK
   * `appendResolvedEntry` over the run options' store/runsRoot. */
  readonly appendResolved?: (opts: {
    readonly store?: unknown;
    readonly runsRoot?: string;
    readonly runId: string;
    readonly correlationId: string;
    readonly reply: unknown;
  }) => Promise<boolean>;
  /** The lifecycle's running row was already written by the caller. */
  readonly lifecycleAlreadyRunning?: boolean;
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
    await sinks.onCompleted?.(result as WorkflowRunResult<unknown>);
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
      return await settle(
        await startWorkflow(ref, args, { ...runOptions, runId }),
      );
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
      const wrote = await appendReply({
        runId,
        correlationId,
        reply,
      });
      if (!wrote) {
        // A prior process journaled the reply then died before settling — the
        // row is stuck. Fail it so the host stops re-arming it forever.
        await lifecycle?.orphanIfSleeping(correlationId);
        return;
      }
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

  return {
    start,
    resume,
    fail,
    cancel,
    isCancelled: () => cancelled,
    settle,
  };
}
