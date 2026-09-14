/**
 * Public contracts of the lifecycle engine (engine.ts).
 *
 * Kept separate from the engine implementation so hosts can import the contracts without
 * pulling the start/resume logic, and so engine.ts stays focused on the lifecycle itself.
 */

import type { JournalStore } from "./journalStore.ts";
import type { WorkflowEventSink } from "./events.ts";
import type { WorkflowBodyExecutor } from "./runEngine.ts";

/** The minimum workflow-reference shape required by the lifecycle engine. */
export interface WorkflowReference {
  /** Stable author-facing workflow identity used in inline workflow primitive arguments. */
  readonly path: string;
}

/** Host-independent options required by the lifecycle engine. */
export interface WorkflowRunOptionsBase {
  readonly runsRoot?: string;
  readonly store?: JournalStore;
  /** Explicitly accept a changed executable, then record it as the new replay baseline. */
  readonly workflowVersionPolicy?: WorkflowVersionPolicy;
  /** Live lifecycle observations (see {@link WorkflowEventSink}); absent = no emission. */
  readonly events?: WorkflowEventSink;
  /**
   * First-class abort: the engine checks it before the body starts, and the durable runtime
   * checks it before every LIVE primitive execution — once it fires, the next live call
   * throws {@link import("./errors.ts").WorkflowAborted} and the run settles as aborted.
   */
  readonly abortSignal?: AbortSignal;
}

export type WorkflowVersionPolicy = "strict" | "allow-change";

export type { RunOutcome } from "./runEngine.ts";

export interface WorkflowRunResult<O> {
  readonly runId: string;
  readonly result: O;
}

export interface SuspendedResult {
  readonly runId: string;
  readonly suspended: true;
  readonly correlationId: string;
}

/** The run settled as aborted (its {@link AbortSignal} fired). */
export interface AbortedResult {
  readonly runId: string;
  readonly aborted: true;
}

/** Any terminal shape a start/resume call can return. */
export type WorkflowResult<O> = WorkflowRunResult<O> | SuspendedResult | AbortedResult;

export type StartWorkflowOptions<Options extends WorkflowRunOptionsBase> = Options & {
  readonly runId?: string;
  readonly overwrite?: boolean;
};

export interface WorkflowEngineAdapter<Ref extends WorkflowReference, Options> {
  /** Stable host identity persisted in run metadata; it may be a file path, URI, or database key. */
  readonly workflowPath: (ref: Ref) => string;
  /** Host policy for the default filesystem root; custom stores may ignore it. */
  readonly defaultRunsRoot: () => string;
  /** Construct the host's default journal store when callers did not inject one. */
  readonly createStore: (runsRoot: string) => JournalStore;
  /** Generate a top-level run id using host policy. */
  readonly newRunId: () => string;
  /** Timestamp used for run metadata; body-visible time remains runtime-journaled. */
  readonly nowIso: () => string;
  /**
   * Optional identity for the exact executable workflow artifact. Hosts that can resolve a
   * stable content/version hash should provide it; old metadata without one remains resumable.
   */
  readonly workflowVersion?: (ref: Ref) => string | Promise<string>;
  /** Bind the generic lifecycle to a host-specific body loader/executor. */
  readonly executeBody: WorkflowBodyExecutor<Ref, Options>;
}

export interface WorkflowEngine<
  Ref extends WorkflowReference,
  Options extends WorkflowRunOptionsBase,
> {
  readonly startWorkflow: <I, O>(
    ref: Ref,
    args: I,
    options?: StartWorkflowOptions<Options>,
  ) => Promise<WorkflowRunResult<O> | SuspendedResult | AbortedResult>;
  readonly resumeWorkflow: <I, O>(
    runId: string,
    ref: Ref,
    args: I,
    options?: Options,
  ) => Promise<WorkflowRunResult<O> | SuspendedResult | AbortedResult>;
}
