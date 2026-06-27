/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Load a `.workflow.ts`, build the body globals (tools/scripts trees + the 25.3 primitive
 * set), run it against a runtime, and decode its result. Shared by the top-level run and by
 * `workflow()` sub-workflow invocation — the only difference is the primitive set: a
 * sub-workflow gets a set whose `workflow()` throws (one level of nesting only).
 *
 * Split out of `t3work-sdk.workflowRunner.ts` to keep that file under the additive-guard
 * LOC ceiling.
 */

import * as NodeModule from "node:module";

import * as Schema from "effect/Schema";

import type { MessageBroker } from "./t3work-sdk.broker.ts";
import type { DurableWorkflowRuntime } from "./t3work-sdk.durableRuntime.ts";
import { WorkflowError } from "./t3work-sdk.errors.ts";
import type { HandleDispatch } from "./t3work-sdk.handles.ts";
import { decodeWithSchema, setNestedValue } from "./t3work-sdk.internal.ts";
import { createWorkflowPrimitives, type WorkflowPrimitives } from "./t3work-sdk.primitives.ts";
import { createSchedulePrimitives } from "./t3work-sdk.schedulePrimitive.ts";
import { createThreadPrimitives } from "./t3work-sdk.threadPrimitives.ts";
import {
  extractMeta,
  prepareWorkflow,
  runWorkflowBody,
  type WorkflowMeta,
  type WorkflowSource,
} from "./t3work-sdk.loader.ts";
import { withWorkflowRuntime } from "./t3work-sdk.ts";
import type * as T from "./t3work-sdk.types.ts";
import { buildWorkflowGlobals } from "./t3work-sdk.workflowGlobals.ts";

const nodeRequire = NodeModule.createRequire(import.meta.url);
const fs = nodeRequire("node:fs") as { readonly readFileSync: (p: string, e: "utf8") => string };

const defaultBroker: MessageBroker = {
  send: () => {
    throw new WorkflowError(
      "This workflow fired a thread verb (spawnThread/agent/thread.askAgent/askUser/notify) but the run was started without a `broker`. Provide one via the run options.",
    );
  },
};

/** Engine feature strings declared in `meta.capabilities` (the ToolGroupRefs are filtered out). */
function engineCapabilities(meta: WorkflowMeta): ReadonlySet<string> {
  return new Set((meta.capabilities ?? []).filter((cap): cap is string => typeof cap === "string"));
}

function buildToolTree(
  refs: ReadonlyArray<T.AnyToolRef>,
  runtime: T.WorkflowRuntime,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const ref of refs) {
    setNestedValue(root, ref.id, (args: unknown) =>
      runtime.callTool(ref as T.ToolRef<unknown, unknown>, args),
    );
  }
  return root;
}

function buildScriptTree(
  scripts: Readonly<Record<string, T.AnyScriptRef>>,
  runtime: T.WorkflowRuntime,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [name, ref] of Object.entries(scripts)) {
    root[name] = (args: unknown) => runtime.callScript(ref as T.ScriptRef<unknown, unknown>, args);
  }
  return root;
}

/** Load + run a workflow body against `runtime`, decoding inputs/outputs against its `meta`. */
export async function runPreparedBody(opts: {
  readonly runtime: T.WorkflowRuntime;
  readonly ref: T.WorkflowRef;
  readonly args: unknown;
  readonly toolRefs: ReadonlyArray<T.AnyToolRef>;
  readonly scripts: Readonly<Record<string, T.AnyScriptRef>>;
  readonly primitives: WorkflowPrimitives;
  readonly handleDispatch: HandleDispatch;
  readonly broker?: MessageBroker;
  readonly launchThreadId?: string;
  readonly defaultModel?: T.ModelSelection;
}): Promise<unknown> {
  const source: WorkflowSource = {
    absolutePath: opts.ref.absolutePath,
    sourceText: fs.readFileSync(opts.ref.absolutePath, "utf8"),
  };
  const prepared = prepareWorkflow(source);
  const meta: WorkflowMeta = extractMeta(prepared, source, Schema);
  const decodedArgs =
    meta.inputs === undefined
      ? opts.args
      : await decodeWithSchema(
          meta.inputs as Schema.Schema<unknown>,
          opts.args,
          `Invalid inputs for workflow '${meta.name}'`,
        );
  // Build the Thread-model globals; capability-gate askUser/notifyUser against meta.capabilities.
  const capabilities = engineCapabilities(meta);
  const threads = createThreadPrimitives({
    dispatch: opts.handleDispatch,
    broker: opts.broker ?? defaultBroker,
    capabilities,
    launchThreadId: opts.launchThreadId,
    defaultModel: opts.defaultModel,
  });
  // `waitUntil` (Epic 27) — capability-gated against the same meta.capabilities (`"schedule"`).
  const schedule = createSchedulePrimitives({
    dispatch: opts.handleDispatch,
    broker: opts.broker ?? defaultBroker,
    capabilities,
  });
  const globals = buildWorkflowGlobals({
    args: decodedArgs,
    tools: buildToolTree(opts.toolRefs, opts.runtime),
    scripts: buildScriptTree(opts.scripts, opts.runtime),
    runtime: opts.runtime,
    primitives: opts.primitives,
    threads,
    schedule,
  });
  const output = await withWorkflowRuntime(opts.runtime, () =>
    runWorkflowBody(prepared, source, globals),
  );
  if (meta.outputs === undefined) return output;
  return await decodeWithSchema(
    meta.outputs as Schema.Schema<unknown>,
    output,
    `Invalid result from workflow '${meta.name}'`,
  );
}

/**
 * Build the workflow-body primitive set for a run: agent/wait/budget/etc. wired to the
 * durable runtime, plus a `workflow()` that runs a sub-workflow against a *nested* set whose
 * own `workflow()` throws (one level of nesting only).
 */
export function buildWorkflowPrimitives(opts: {
  readonly runtime: DurableWorkflowRuntime;
  readonly options: T.WorkflowRunOptions;
  readonly toolRefs: ReadonlyArray<T.AnyToolRef>;
  readonly scripts: Readonly<Record<string, T.AnyScriptRef>>;
}): WorkflowPrimitives {
  const { runtime, options } = opts;
  const broker = options.broker ?? defaultBroker;
  const shared = {
    callPrimitive: runtime.callPrimitive,
    runBlackBoxed: runtime.runBlackBoxed,
    spentAgentTokens: runtime.spentAgentTokens,
    hostNow: runtime.hostNow,
    budgetTotal: options.budget ?? 0,
    onPhase: options.onPhase ?? (() => {}),
    onLog: options.onLog ?? (() => {}),
  };
  const nested = createWorkflowPrimitives(shared);
  const runSubWorkflow = (ref: T.WorkflowRef, args: unknown): Promise<unknown> =>
    runPreparedBody({
      runtime,
      ref,
      args,
      toolRefs: opts.toolRefs,
      scripts: opts.scripts,
      primitives: nested,
      handleDispatch: runtime.handles,
      broker,
      ...(options.launchThreadId === undefined ? {} : { launchThreadId: options.launchThreadId }),
      ...(options.defaultModel === undefined ? {} : { defaultModel: options.defaultModel }),
    });
  return createWorkflowPrimitives({ ...shared, runSubWorkflow });
}
