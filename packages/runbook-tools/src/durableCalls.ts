import { WorkflowError } from "@runbook/core/errors";
import type { PrimitiveCall } from "@runbook/core/runtimeTypes";
import { decodeWithSchema } from "@runbook/core/schema";

import type { ToolRef } from "./index.ts";

export interface ToolCallsDeps<Context> {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  readonly toolCtx: Context;
  readonly withBlackBox: <R>(run: () => Promise<R>) => Promise<R>;
  readonly executeTool: (ref: unknown, args: unknown, ctx: Context) => Promise<unknown>;
  readonly beforePrimitive?: (() => Promise<boolean>) | undefined;
  readonly afterPrimitive?: (() => void) | undefined;
}

/** Build journaled tool calls while leaving registry and handler execution policy injectable. */
export function createToolCalls<Context>(deps: ToolCallsDeps<Context>) {
  const executePrimitive = async <R>(execute: () => Promise<R>): Promise<R> => {
    if ((await deps.beforePrimitive?.()) === false) throw new WorkflowError("Workflow was stopped");
    let result!: R;
    try {
      result = await execute();
    } finally {
      deps.afterPrimitive?.();
    }
    if ((await deps.beforePrimitive?.()) === false) {
      throw new WorkflowError("Workflow was stopped");
    }
    return result;
  };

  return {
    callTool: async <I, R>(ref: ToolRef<I, R>, args: I): Promise<R> => {
      const decodedArgs = await decodeWithSchema(
        ref.args,
        args,
        `Invalid arguments for tool '${ref.id}'`,
      );
      return await deps.callPrimitive<R>({
        kind: "tool",
        refId: ref.id,
        args: decodedArgs,
        exec: () =>
          executePrimitive(() =>
            deps.withBlackBox(() => deps.executeTool(ref, decodedArgs, deps.toolCtx) as Promise<R>),
          ),
        decodeRecorded: (recorded) =>
          decodeWithSchema(ref.result, recorded, `Invalid recorded result for tool '${ref.id}'`),
      });
    },
  };
}
