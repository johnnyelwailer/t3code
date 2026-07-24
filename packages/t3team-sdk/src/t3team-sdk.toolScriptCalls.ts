/**
 * The typed `tools.*` / `scripts.*` dispatch seats for the durable runtime. Both funnel
 * through the generic {@link T.WorkflowRuntime.callPrimitive} seat — the journaled
 * checkpoint — and execute their handler inside the `blackBox` runtime so a handler that
 * calls another tool/script does NOT journal a position of its own (see the durable-runtime
 * module header). Split out of `t3team-sdk.durableRuntime.ts` to keep that file under the
 * additive-guard LOC ceiling.
 */

import { WorkflowError } from "./t3team-sdk.errors.ts";
import { decodeWithSchema } from "./t3team-sdk.internal.ts";
import { executeRegisteredTool, executeScriptHandler, withWorkflowRuntime } from "./t3team-sdk.ts";
import type * as T from "./t3team-sdk.types.ts";

/** Dependencies the dispatch seats close over — supplied by the durable runtime. */
export interface ToolScriptCallsDeps {
  readonly callPrimitive: <R>(call: T.PrimitiveCall<R>) => Promise<R>;
  readonly blackBox: T.WorkflowRuntime;
  readonly toolCtx: T.ToolHandlerCtx;
  readonly scriptCtx: T.ScriptHandlerCtx;
  readonly scriptNames: ReadonlyMap<T.AnyScriptRef, string>;
  readonly beforePrimitive?: () => Promise<boolean>;
  readonly afterPrimitive?: () => void;
}

/** Build the `callTool` / `callScript` pair for a durable runtime. */
export function createToolScriptCalls(deps: ToolScriptCallsDeps): {
  readonly callTool: <I, R>(ref: T.ToolRef<I, R>, args: I) => Promise<R>;
  readonly callScript: <I, O>(ref: T.ScriptRef<I, O>, args: I) => Promise<O>;
} {
  const executePrimitive = async <R>(execute: () => Promise<R>): Promise<R> => {
    if ((await deps.beforePrimitive?.()) === false) throw new WorkflowError("Workflow was stopped");
    try {
      return await execute();
    } finally {
      deps.afterPrimitive?.();
      if ((await deps.beforePrimitive?.()) === false) {
        throw new WorkflowError("Workflow was stopped");
      }
    }
  };
  const callTool = async <I, R>(ref: T.ToolRef<I, R>, args: I): Promise<R> => {
    const decodedArgs = await decodeWithSchema(
      ref.args,
      args,
      `Invalid arguments for tool '${ref.id}'`,
    );
    return deps.callPrimitive<R>({
      kind: "tool",
      refId: ref.id,
      args: decodedArgs,
      exec: () =>
        executePrimitive(
          () =>
            withWorkflowRuntime(deps.blackBox, () =>
              executeRegisteredTool(ref.id, decodedArgs, deps.toolCtx),
            ) as Promise<R>,
        ),
      decodeRecorded: (recorded) =>
        decodeWithSchema(ref.result, recorded, `Invalid recorded result for tool '${ref.id}'`),
    });
  };

  const callScript = async <I, O>(ref: T.ScriptRef<I, O>, args: I): Promise<O> => {
    const refId = deps.scriptNames.get(ref as T.AnyScriptRef);
    if (refId === undefined) {
      // Reaching here means the caller bypassed the `scripts.*` tree or mismatched the
      // registration set between start and resume — a bug, not something to paper over.
      throw new WorkflowError(
        "A script ref was dispatched that is not registered in this run's `scripts` option. Register every script you call (the `scripts.*` tree only exposes registered scripts).",
      );
    }
    const decodedArgs = await decodeWithSchema(ref.inputs, args, "Invalid arguments for script");
    return deps.callPrimitive<O>({
      kind: ref.replay === "never" ? "script-never" : "script",
      refId,
      args: decodedArgs,
      replay: ref.replay,
      exec: () =>
        executePrimitive(
          () =>
            withWorkflowRuntime(deps.blackBox, () =>
              executeScriptHandler(ref, decodedArgs, deps.scriptCtx),
            ) as Promise<O>,
        ),
      decodeRecorded: (recorded) =>
        decodeWithSchema(ref.outputs, recorded, `Invalid recorded result for script '${refId}'`),
    });
  };

  return { callTool, callScript };
}
