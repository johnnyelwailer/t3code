import { WorkflowError } from "@runbook/core/errors";
import type { PrimitiveCall } from "@runbook/core/runtimeTypes";
import { decodeWithSchema } from "@runbook/core/schema";

import type { AnyScriptRef, ScriptRef } from "./index.ts";

export interface ScriptCallsDeps<Context> {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  readonly scriptCtx: Context;
  readonly scriptNames: ReadonlyMap<object, string>;
  readonly withBlackBox: <R>(run: () => Promise<R>) => Promise<R>;
  readonly executeScript: (ref: unknown, args: unknown, ctx: Context) => Promise<unknown>;
  readonly beforePrimitive?: (() => Promise<boolean>) | undefined;
  readonly afterPrimitive?: (() => void) | undefined;
}

/** Build journaled script calls while leaving the host executor and registry policy injectable. */
export function createScriptCalls<Context>(deps: ScriptCallsDeps<Context>) {
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

  return {
    callScript: async <I, O>(ref: ScriptRef<I, O>, args: I): Promise<O> => {
      const refId = deps.scriptNames.get(ref as object);
      if (refId === undefined) {
        throw new WorkflowError(
          "A script ref was dispatched that is not registered in this run's `scripts` option. Register every script you call (the `scripts.*` tree only exposes registered scripts).",
        );
      }
      const decodedArgs = await decodeWithSchema(ref.inputs, args, "Invalid arguments for script");
      return await deps.callPrimitive<O>({
        kind: ref.replay === "never" ? "script-never" : "script",
        refId,
        args: decodedArgs,
        replay: ref.replay,
        exec: () =>
          executePrimitive(() =>
            deps.withBlackBox(
              () => deps.executeScript(ref, decodedArgs, deps.scriptCtx) as Promise<O>,
            ),
          ),
        decodeRecorded: (recorded) =>
          decodeWithSchema(ref.outputs, recorded, `Invalid recorded result for script '${refId}'`),
      });
    },
  };
}

export type { AnyScriptRef };
