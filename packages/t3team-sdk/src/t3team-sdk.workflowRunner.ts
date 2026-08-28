/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * T3Code's body-execution adapter. The reusable run loop, suspension funnel, and journal
 * durability barrier live in @runbook/core; this module retains registries, contexts, and the
 * .workflow.ts body binding.
 */

import * as DateTime from "effect/DateTime";

import type { ExecuteBodyRequest } from "@runbook/core/runEngine";

import { runPreparedBody } from "./t3team-sdk.bodyRunner.ts";
import { buildWorkflowPrimitives } from "./t3team-sdk.subWorkflows.ts";
import {
  createDurableWorkflowRuntime,
  type DurableWorkflowRuntime,
} from "./t3team-sdk.durableRuntime.ts";
import { WorkflowError } from "./t3team-sdk.errors.ts";
import { runDirPath } from "./t3team-sdk.journal.ts";
import { executeToolHandler, listRegisteredTools } from "./t3team-sdk.ts";
import type * as T from "./t3team-sdk.types.ts";

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
  // Host-backed tool refs are registered globally (the engine executes a tool by id), so their
  // per-run wiring has to arrive through the ctx rather than a closure — this is that seat.
  toolCtxRef = {
    ...shared,
    callTool,
    ...(opts.options.t3team === undefined ? {} : { t3team: opts.options.t3team }),
  };
  return { toolCtx: toolCtxRef, scriptCtx: { ...shared, callTool } };
}

export async function executeWorkflowBody(
  opts: ExecuteBodyRequest<T.WorkflowRef, T.WorkflowRunOptions>,
): Promise<unknown> {
  const runDir = runDirPath(opts.runsRoot, opts.runId);
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
    journal: opts.journal.bySeq,
    writer: opts.sink,
    toolCtx,
    scriptCtx,
    scriptNames,
    filePath: opts.ref.absolutePath,
    nowIso,
    runId: opts.runId,
    resolved: opts.journal.byCorrelation,
    ...(opts.options.beforePrimitive === undefined
      ? {}
      : { beforePrimitive: opts.options.beforePrimitive }),
    ...(opts.options.afterPrimitive === undefined
      ? {}
      : { afterPrimitive: opts.options.afterPrimitive }),
    ...(opts.events === undefined ? {} : { events: opts.events }),
    ...(opts.abortSignal === undefined ? {} : { abortSignal: opts.abortSignal }),
  });
  const { primitives, captureCapabilities } = buildWorkflowPrimitives({
    runtime,
    options: opts.options,
    toolRefs,
    scripts,
    nowIso,
  });
  return await runPreparedBody({
    runtime,
    ref: opts.ref,
    args: opts.args,
    toolRefs,
    scripts,
    primitives,
    // Feed the body's capability set back so workflow() children intersect against it.
    onCapabilities: captureCapabilities,
    handleDispatch: runtime.handles,
    ...(opts.options.broker === undefined ? {} : { broker: opts.options.broker }),
    ...(opts.options.launchThreadId === undefined
      ? {}
      : { launchThreadId: opts.options.launchThreadId }),
    ...(opts.options.defaultModel === undefined ? {} : { defaultModel: opts.options.defaultModel }),
  });
}
