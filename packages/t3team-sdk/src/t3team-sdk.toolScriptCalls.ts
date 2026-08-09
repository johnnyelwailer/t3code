/**
 * T3Code's binding for the reusable durable tool/script call factories.
 *
 * The generic packages own journal primitive construction, schema decoding, replay policy, and
 * stop hooks. T3Code injects its process-global tool lookup, handler contexts, and ALS runtime.
 */

import { createScriptCalls } from "@runbook/scripts/durableCalls";
import { createToolCalls } from "@runbook/tools/durableCalls";
import type { PrimitiveCall } from "@runbook/core/runtimeTypes";

import { executeRegisteredTool, executeScriptHandler, withWorkflowRuntime } from "./t3team-sdk.ts";
import type * as T from "./t3team-sdk.types.ts";

export interface ToolScriptCallsDeps {
  readonly callPrimitive: <R>(call: T.PrimitiveCall<R>) => Promise<R>;
  readonly blackBox: T.WorkflowRuntime;
  readonly toolCtx: T.ToolHandlerCtx;
  readonly scriptCtx: T.ScriptHandlerCtx;
  readonly scriptNames: ReadonlyMap<T.AnyScriptRef, string>;
  readonly beforePrimitive?: () => Promise<boolean>;
  readonly afterPrimitive?: () => void;
}

/** Build T3Code's `callTool` / `callScript` pair from the reusable factories. */
export function createToolScriptCalls(deps: ToolScriptCallsDeps): {
  readonly callTool: <I, R>(ref: T.ToolRef<I, R>, args: I) => Promise<R>;
  readonly callScript: <I, O>(ref: T.ScriptRef<I, O>, args: I) => Promise<O>;
} {
  const callPrimitive = <R>(call: PrimitiveCall<R>): Promise<R> =>
    deps.callPrimitive(call as T.PrimitiveCall<R>);
  const withBlackBox = <R>(run: () => Promise<R>): Promise<R> =>
    withWorkflowRuntime(deps.blackBox, run);
  const shared = {
    callPrimitive,
    withBlackBox,
    beforePrimitive: deps.beforePrimitive,
    afterPrimitive: deps.afterPrimitive,
  };
  const tools = createToolCalls({
    ...shared,
    toolCtx: deps.toolCtx,
    executeTool: (ref, args, ctx) =>
      executeRegisteredTool((ref as T.AnyToolRef).id, args, ctx as T.ToolHandlerCtx),
  });
  const scripts = createScriptCalls({
    ...shared,
    scriptCtx: deps.scriptCtx,
    scriptNames: deps.scriptNames as ReadonlyMap<object, string>,
    executeScript: (ref, args, ctx) =>
      executeScriptHandler(ref as T.ScriptRef<unknown, unknown>, args, ctx as T.ScriptHandlerCtx),
  });
  return {
    callTool: tools.callTool as <I, R>(ref: T.ToolRef<I, R>, args: I) => Promise<R>,
    callScript: scripts.callScript as <I, O>(ref: T.ScriptRef<I, O>, args: I) => Promise<O>,
  };
}
