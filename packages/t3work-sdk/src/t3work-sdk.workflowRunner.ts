/**
 * Per-run plumbing: read the journal, build the tool/script handler contexts, run the
 * workflow body, and persist/verify the recorded inputs hash. The {@link executeRun}
 * entry point is shared by {@link startWorkflow} and {@link resumeWorkflow}.
 */

import * as DateTime from "effect/DateTime";

import { buildWorkflowPrimitives, runPreparedBody } from "./t3work-sdk.bodyRunner.ts";
import { hashArgs, hashPrefix } from "./t3work-sdk.canonicalJson.ts";
import {
  createDurableWorkflowRuntime,
  type DurableWorkflowRuntime,
} from "./t3work-sdk.durableRuntime.ts";
import { ReplayDriftError, WorkflowError } from "./t3work-sdk.errors.ts";
import { WorkflowSuspended } from "./t3work-sdk.handles.ts";
import type { RunMeta } from "./t3work-sdk.journal.ts";
import { runDirPath } from "./t3work-sdk.journal.ts";
import { createStoreSink, type JournalStore } from "./t3work-sdk.journalStore.ts";
import { executeToolHandler, listRegisteredTools } from "./t3work-sdk.ts";
import type * as T from "./t3work-sdk.types.ts";

const noopLogger: T.ToolLogger = { info: () => {}, warn: () => {}, error: () => {} };
const unsupportedFetch: T.FetchLike = async () => {
  throw new WorkflowError(
    "This workflow run was started without a `fetch` implementation; provide one via run options to call tools that use it.",
  );
};
const unsupportedWorkspace: T.ToolWorkspace = {
  readText: async () => {
    throw new WorkflowError("This workflow run was started without a workspace filesystem.");
  },
  writeText: async () => {
    throw new WorkflowError("This workflow run was started without a workspace filesystem.");
  },
  exists: async () => false,
};

/** Host clock for journal timestamps. Workflow *bodies* are forbidden from reading wall-clock. */
export function nowIso(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

function buildRunContexts(opts: {
  readonly runId: string;
  readonly runDir: string;
  readonly options: T.WorkflowRunOptions;
}): { readonly toolCtx: T.ToolHandlerCtx; readonly scriptCtx: T.ScriptHandlerCtx } {
  const log = opts.options.log ?? noopLogger;
  const fetch = opts.options.fetch ?? unsupportedFetch;
  const workspace = opts.options.workspace ?? unsupportedWorkspace;
  const workspaceRoot = opts.options.workspaceRoot ?? opts.runDir;
  // Black-box nested dispatch: see the engine module header for why handlers don't journal.
  const shared = { runId: opts.runId, workspaceRoot, log, fetch, workspace };
  let toolCtxRef!: T.ToolHandlerCtx;
  const callTool = <I, R>(ref: T.ToolRef<I, R>, args: I) =>
    executeToolHandler(ref, args, toolCtxRef);
  toolCtxRef = { ...shared, callTool };
  return { toolCtx: toolCtxRef, scriptCtx: { ...shared, callTool } };
}

/** The result of one body execution: a completed value, or a durable suspension awaiting a
 * Handle reply. {@link startWorkflow}/{@link resumeWorkflow} map this onto their public union. */
export type RunOutcome<O> =
  | { readonly kind: "completed"; readonly output: O }
  | { readonly kind: "suspended"; readonly correlationId: string };

export async function executeRun<O>(opts: {
  readonly runId: string;
  readonly ref: T.WorkflowRef<unknown, O>;
  readonly args: unknown;
  readonly runsRoot: string;
  readonly store: JournalStore;
  readonly options: T.WorkflowRunOptions;
}): Promise<RunOutcome<O>> {
  const runDir = runDirPath(opts.runsRoot, opts.runId);
  const log = opts.options.log ?? noopLogger;
  const { bySeq, byCorrelation } = await opts.store.readEntries(opts.runId);
  const sink = createStoreSink(opts.store, opts.runId);
  const toolRefs = opts.options.tools ?? listRegisteredTools();
  const scripts = opts.options.scripts ?? {};
  const scriptNames = new Map<T.AnyScriptRef, string>(
    Object.entries(scripts).map(([name, ref]) => [ref, name] as const),
  );
  const { toolCtx, scriptCtx } = buildRunContexts({
    runId: opts.runId,
    runDir,
    options: opts.options,
  });
  const runtime: DurableWorkflowRuntime = createDurableWorkflowRuntime({
    journal: bySeq,
    writer: sink,
    toolCtx,
    scriptCtx,
    scriptNames,
    filePath: opts.ref.absolutePath,
    nowIso,
    runId: opts.runId,
    resolved: byCorrelation,
  });
  try {
    const primitives = buildWorkflowPrimitives({
      runtime,
      options: opts.options,
      toolRefs,
      scripts,
    });
    const result = await runPreparedBody({
      runtime,
      ref: opts.ref,
      args: opts.args,
      toolRefs,
      scripts,
      primitives,
      handleDispatch: runtime.handles,
      ...(opts.options.broker === undefined ? {} : { broker: opts.options.broker }),
      ...(opts.options.launchThreadId === undefined
        ? {}
        : { launchThreadId: opts.options.launchThreadId }),
      ...(opts.options.defaultModel === undefined
        ? {}
        : { defaultModel: opts.options.defaultModel }),
    });
    return { kind: "completed", output: result as O };
  } catch (error) {
    // A genuine durable suspension (awaiting a Handle reply) is not a failure — the host
    // parks the run and resumes it when the reply lands.
    if (error instanceof WorkflowSuspended) {
      return { kind: "suspended", correlationId: error.correlationId };
    }
    throw error;
  } finally {
    // The durability barrier: await every enqueued append (re-throwing a deferred store
    // error) before the outcome is returned, so the host never parks/completes a run over a
    // journal write that did not land.
    await sink.flush();
    sink.dispose();
  }
}

/** Verify a resume's args hash matches the recorded runMeta; seq-0 drift boundary. */
export function assertInputArgsMatch(opts: {
  readonly meta: RunMeta | undefined;
  readonly args: unknown;
  readonly absolutePath: string;
}): void {
  if (opts.meta === undefined) return; // pre-this-version run, no recorded inputs to compare
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
