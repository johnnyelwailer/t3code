import { hashArgs } from "./canonicalJson.ts";
import { WorkflowError, WorkflowRunNotFoundError } from "./errors.ts";
import {
  settleRun,
  settleRunFailed,
  toRunResult,
  writeTerminalMeta,
  type SettleContext,
} from "./engineSettle.ts";
import { executeWorkflowRun } from "./runEngine.ts";
import type { JournalStore } from "./journalStore.ts";
import type {
  StartWorkflowOptions,
  WorkflowEngine,
  WorkflowEngineAdapter,
  WorkflowReference,
  WorkflowResult,
  WorkflowRunOptionsBase,
} from "./engineTypes.ts";
import { assertInputArgsMatch, assertWorkflowVersionMatch } from "./engineValidation.ts";

export { assertInputArgsMatch, assertWorkflowVersionMatch } from "./engineValidation.ts";

/**
 * Create the reusable start/resume lifecycle around a host-specific body executor. The engine
 * owns run identity, metadata, overwrite/resume guards, input drift, and the journal-store
 * boundary; it deliberately does not know how workflows are loaded, which tools exist, or how
 * a host records live run status — those concerns stay in the adapter.
 */
export function createWorkflowEngine<
  Ref extends WorkflowReference,
  Options extends WorkflowRunOptionsBase,
>(adapter: WorkflowEngineAdapter<Ref, Options>): WorkflowEngine<Ref, Options> {
  /** Drive the body and settle the run; settleRunFailed rethrows, so this never swallows. */
  const drive = async <I, O>(
    runId: string,
    ref: Ref,
    args: I,
    runsRoot: string,
    store: JournalStore,
    options: Options,
    settle: SettleContext,
  ): Promise<WorkflowResult<O>> => {
    try {
      const outcome = await executeWorkflowRun({
        runId,
        ref,
        args,
        runsRoot,
        store,
        options,
        body: adapter.executeBody,
        events: options.events,
        abortSignal: options.abortSignal,
      });
      await settleRun(settle, outcome);
      return toRunResult(runId, outcome);
    } catch (error) {
      return await settleRunFailed(settle, error);
    }
  };

  const startWorkflow = async <I, O>(
    ref: Ref,
    args: I,
    options: StartWorkflowOptions<Options> = {} as StartWorkflowOptions<Options>,
  ): Promise<WorkflowResult<O>> => {
    const runsRoot = options.runsRoot ?? adapter.defaultRunsRoot();
    const store = options.store ?? adapter.createStore(runsRoot);
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

    const settle: SettleContext = {
      store,
      runId,
      nowIso: adapter.nowIso,
      ...(options.events === undefined ? {} : { events: options.events }),
    };
    if (options.abortSignal?.aborted === true) {
      // Pre-aborted start: the body never ran; mark the fresh run aborted and stop.
      await writeTerminalMeta(settle, "aborted");
      options.events?.on({ type: "run.started", runId, startKind: "start", at: adapter.nowIso() });
      options.events?.on({ type: "run.aborted", runId, at: adapter.nowIso() });
      return { runId, aborted: true };
    }
    options.events?.on({ type: "run.started", runId, startKind: "start", at: adapter.nowIso() });
    return await drive(runId, ref, args, runsRoot, store, options, settle);
  };

  const resumeWorkflow = async <I, O>(
    runId: string,
    ref: Ref,
    args: I,
    options: Options = {} as Options,
  ): Promise<WorkflowResult<O>> => {
    const runsRoot = options.runsRoot ?? adapter.defaultRunsRoot();
    const store = options.store ?? adapter.createStore(runsRoot);
    if (!(await store.hasRun(runId))) throw new WorkflowRunNotFoundError(store.locator(runId));
    const meta = await store.readRunMeta(runId);
    if (meta?.terminal === "aborted") {
      throw new WorkflowError(
        `Cannot resume run '${runId}': it was aborted. An aborted run has no pending work to drive; start a new run instead.`,
      );
    }
    if (options.abortSignal?.aborted === true) {
      // Refuse up front WITHOUT writing: the body never ran, so the run's prior terminal
      // state (completed/failed are resumable) must not be clobbered to "aborted".
      throw new WorkflowError(
        `Cannot resume run '${runId}': the abort signal is already aborted. Pass a live signal or omit it.`,
      );
    }
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
    const settle: SettleContext = {
      store,
      runId,
      nowIso: adapter.nowIso,
      ...(options.events === undefined ? {} : { events: options.events }),
    };
    options.events?.on({ type: "run.started", runId, startKind: "resume", at: adapter.nowIso() });
    return await drive(runId, ref, args, runsRoot, store, options, settle);
  };

  return { startWorkflow, resumeWorkflow };
}
