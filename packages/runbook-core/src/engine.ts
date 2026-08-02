import { hashArgs, hashPrefix } from "./canonicalJson.ts";
import { ReplayDriftError, WorkflowError, WorkflowRunNotFoundError } from "./errors.ts";
import { executeWorkflowRun, type WorkflowBodyExecutor } from "./runEngine.ts";
import type { RunOutcome } from "./runEngine.ts";
import type { RunMeta } from "./journal.ts";
import type { JournalStore } from "./journalStore.ts";

/** The minimum workflow-reference shape required by the lifecycle engine. */
export interface WorkflowReference {
  readonly absolutePath: string;
  /** Optional stable author-facing path used in inline workflow primitive arguments. */
  readonly path?: string;
}

/** Host-independent options required by the lifecycle engine. */
export interface WorkflowRunOptionsBase {
  readonly runsRoot?: string;
  readonly store?: JournalStore;
}

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
  /** Host policy for the default filesystem root; custom stores may ignore it. */
  readonly defaultRunsRoot: () => string;
  /** Construct the host's default journal store when callers did not inject one. */
  readonly createStore: (runsRoot: string) => JournalStore;
  /** Generate a top-level run id using host policy. */
  readonly newRunId: () => string;
  /** Timestamp used for run metadata; body-visible time remains runtime-journaled. */
  readonly nowIso: () => string;
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

/** Verify a resume's args hash at the seq-0 drift boundary. */
export function assertInputArgsMatch(opts: {
  readonly meta: RunMeta | undefined;
  readonly args: unknown;
  readonly absolutePath: string;
}): void {
  if (opts.meta === undefined) return;
  const suppliedHash = hashArgs(opts.args);
  if (opts.meta.argsHash !== suppliedHash) {
    throw new ReplayDriftError({
      seq: 0,
      reason: "args",
      expected: { argsHash: hashPrefix(opts.meta.argsHash) },
      observed: { argsHash: hashPrefix(suppliedHash) },
      filePath: opts.absolutePath,
    });
  }
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
    const existing = await store.readEntries(runId);
    if (existing.bySeq.size > 0) {
      if (options.overwrite !== true) {
        throw new WorkflowError(
          `Cannot start workflow with runId '${runId}': a journal already exists at '${store.locator(runId)}' with ${existing.bySeq.size} entr${existing.bySeq.size === 1 ? "y" : "ies"}. Use resumeWorkflow to continue it, pass { overwrite: true } to truncate and restart, or pick a different runId.`,
        );
      }
      await store.clear(runId);
    }

    await store.writeRunMeta(runId, {
      workflowPath: ref.absolutePath,
      argsHash: hashArgs(args),
      createdAt: adapter.nowIso(),
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
    assertInputArgsMatch({ meta, args, absolutePath: ref.absolutePath });
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
