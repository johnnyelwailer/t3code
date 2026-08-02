import { hashArgs } from "./canonicalJson.ts";
import { WorkflowError, WorkflowRunNotFoundError } from "./errors.ts";
import { executeWorkflowRun, type WorkflowBodyExecutor } from "./runEngine.ts";
import type { RunOutcome } from "./runEngine.ts";
import type { JournalStore } from "./journalStore.ts";
import { assertInputArgsMatch, assertWorkflowVersionMatch } from "./engineValidation.ts";

export { assertInputArgsMatch, assertWorkflowVersionMatch } from "./engineValidation.ts";

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
  ) => Promise<WorkflowRunResult<O> | SuspendedResult>;
  readonly resumeWorkflow: <I, O>(
    runId: string,
    ref: Ref,
    args: I,
    options?: Options,
  ) => Promise<WorkflowRunResult<O> | SuspendedResult>;
}

function toRunResult<O>(
  runId: string,
  outcome: RunOutcome,
): WorkflowRunResult<O> | SuspendedResult {
  return outcome.kind === "suspended"
    ? { runId, suspended: true, correlationId: outcome.correlationId }
    : { runId, result: outcome.output as O };
}

/**
 * Create the reusable start/resume lifecycle around a host-specific body executor.
 *
 * The engine owns run identity, metadata, overwrite/resume guards, input drift, and the
 * journal-store boundary. It deliberately does not know how workflows are loaded, which
 * tools exist, or how a host records live run status; those concerns stay in the adapter.
 */
export function createWorkflowEngine<
  Ref extends WorkflowReference,
  Options extends WorkflowRunOptionsBase,
>(adapter: WorkflowEngineAdapter<Ref, Options>): WorkflowEngine<Ref, Options> {
  const resolveStore = (options: WorkflowRunOptionsBase, runsRoot: string): JournalStore =>
    options.store ?? adapter.createStore(runsRoot);

  const startWorkflow = async <I, O>(
    ref: Ref,
    args: I,
    options: StartWorkflowOptions<Options> = {} as StartWorkflowOptions<Options>,
  ): Promise<WorkflowRunResult<O> | SuspendedResult> => {
    const runsRoot = options.runsRoot ?? adapter.defaultRunsRoot();
    const store = resolveStore(options, runsRoot);
    const runId = options.runId ?? adapter.newRunId();
    const workflowPath = adapter.workflowPath(ref);
    const existing = await store.readEntries(runId);
    if (existing.bySeq.size > 0) {
      if (options.overwrite !== true) {
        throw new WorkflowError(
          `Cannot start workflow with runId '${runId}': a journal already exists at '${store.locator(runId)}' with ${existing.bySeq.size} entr${existing.bySeq.size === 1 ? "y" : "ies"}. Use resumeWorkflow to continue it, pass { overwrite: true } to truncate and restart, or pick a different runId.`,
        );
      }
      await store.clear(runId);
    }

    const workflowVersion = await adapter.workflowVersion?.(ref);

    await store.writeRunMeta(runId, {
      workflowPath,
      argsHash: hashArgs(args),
      createdAt: adapter.nowIso(),
      ...(workflowVersion === undefined ? {} : { workflowVersion }),
    });

    const outcome = await executeWorkflowRun({
      runId,
      ref,
      args,
      runsRoot,
      store,
      options,
      body: adapter.executeBody,
    });
    return toRunResult(runId, outcome);
  };

  const resumeWorkflow = async <I, O>(
    runId: string,
    ref: Ref,
    args: I,
    options: Options = {} as Options,
  ): Promise<WorkflowRunResult<O> | SuspendedResult> => {
    const runsRoot = options.runsRoot ?? adapter.defaultRunsRoot();
    const store = resolveStore(options, runsRoot);
    if (!(await store.hasRun(runId))) throw new WorkflowRunNotFoundError(store.locator(runId));
    const meta = await store.readRunMeta(runId);
    const workflowPath = adapter.workflowPath(ref);
    assertInputArgsMatch({ meta, args, workflowPath });
    const workflowVersion = await adapter.workflowVersion?.(ref);
    assertWorkflowVersionMatch({
      meta,
      workflowVersion,
      workflowPath,
      policy: options.workflowVersionPolicy,
    });
    if (
      options.workflowVersionPolicy === "allow-change" &&
      meta !== undefined &&
      workflowVersion !== undefined &&
      meta.workflowVersion !== workflowVersion
    ) {
      await store.writeRunMeta(runId, { ...meta, workflowVersion });
    }
    const outcome = await executeWorkflowRun({
      runId,
      ref,
      args,
      runsRoot,
      store,
      options,
      body: adapter.executeBody,
    });
    return toRunResult(runId, outcome);
  };

  return { startWorkflow, resumeWorkflow };
}
