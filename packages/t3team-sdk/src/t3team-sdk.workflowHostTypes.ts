/**
 * Host-neutral per-run workflow host — types.
 *
 * The host-neutral run control funnel (`createWorkflowRunHost`,
 * `t3team-sdk.workflowHost.ts`) is built by any durable host on top of
 * `@runbook/core`'s reusable run loop and this package's engine
 * (`startWorkflow` / `resumeWorkflow` / `appendResolvedEntry`). This module
 * declares the funnel's contract; every host-specific piece — the broker,
 * the durable run-row lifecycle, completion/failure notification sinks, and
 * an optional bounded self-repair attempt — is injected. No application code
 * appears here.
 */

import type { WorkflowRef, WorkflowRunOptions } from "./t3team-sdk.types.ts";
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
 * the active claim. Implementations write through to the host's source of
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
  /** Mark the run completed and clear the pending ask. */
  readonly recordCompleted: () => Promise<void>;
  /** Mark the run failed, clear the pending ask, persist the reason. */
  readonly recordFailed: (
    detail: {
      readonly reason: string;
      readonly step: string;
      readonly retainPending?: boolean;
    },
  ) => Promise<void>;
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

/** The per-run control handle the host registry and host funnels drive. */
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
  /** A durable reply can already be present after a transient host interruption.
   * Return true only when this host may replay that recorded reply; clock wakes
   * can retain the default false and use their orphan policy instead. */
  readonly retryResolvedReply?: (correlationId: string) => Promise<boolean> | boolean;
  /** The lifecycle's running row was already written by the caller. */
  readonly lifecycleAlreadyRunning?: boolean;
  /** Called once a reply is journaled, before the replay drives (host UX sink). */
  readonly onReplyJournaled?: (correlationId: string) => Promise<void> | void;
}
