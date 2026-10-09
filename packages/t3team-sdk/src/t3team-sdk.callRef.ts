/**
 * `callRef(ref, input, { outputs, fallback })` (G11): call a code reference a recipe config
 * holds — a workflow or a recipe action, as `getConfig()` returns them — as a sub-workflow of
 * this run, and decode its output against the slot's contract. It fails closed: no reference, a
 * reference this body cannot call, a failed run or an output that does not fit returns the
 * fallback, and `onFallback` says why (once per call, for the card's warning).
 *
 * Script references (`{ kind: "script" }`) are returned to the fallback: a script runs only for
 * the recipe that registers it, so a recipe exposes a script slot through its own `scripts`.
 */
import type * as Schema from "effect/Schema";

import { fromRun } from "./t3team-sdk.engineApi.ts";
import { decodeWithSchema } from "./t3team-sdk.internal.ts";
import type { WorkflowRef } from "./t3team-sdk.types.ts";

export type ConfigCodeRef =
  | { readonly kind: "workflow"; readonly absolutePath: string }
  | { readonly kind: "recipe-action"; readonly workflowPath: string; readonly recipeId: string }
  | { readonly kind: "script"; readonly modulePath: string };

export interface CallRefOptions<O> {
  readonly outputs: Schema.Schema<O>;
  readonly fallback: () => O | Promise<O>;
  readonly onFallback?: (reason: string) => void;
}

type RunWorkflow = (ref: WorkflowRef<unknown, unknown>, args?: unknown) => Promise<unknown>;

export function createCallRef(runWorkflow: RunWorkflow) {
  return async <O>(ref: unknown, input: unknown, opts: CallRefOptions<O>): Promise<O> => {
    const fallback = async (reason: string) => {
      opts.onFallback?.(reason);
      return await opts.fallback();
    };
    const target = ref as Partial<ConfigCodeRef> | null | undefined;
    const path =
      target?.kind === "workflow"
        ? target.absolutePath
        : target?.kind === "recipe-action"
          ? target.workflowPath
          : undefined;
    if (path === undefined) {
      return await fallback(
        target?.kind === "script"
          ? "a script reference runs only through its own recipe's scripts"
          : "no workflow or recipe-action reference",
      );
    }
    let output: unknown;
    try {
      output = await runWorkflow(
        Object.freeze({ kind: "workflow", path, absolutePath: path }) as WorkflowRef<
          unknown,
          unknown
        >,
        input,
      );
    } catch (error) {
      return await fallback(
        `the referenced workflow failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      return await decodeWithSchema(opts.outputs, output, "output");
    } catch (error) {
      return await fallback(
        `its output does not fit the slot's contract (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  };
}

/** Call a config reference as a sub-workflow, decoding its output; falls back on any failure. */
export function callRef<O>(ref: unknown, input: unknown, opts: CallRefOptions<O>): Promise<O> {
  return fromRun<ReturnType<typeof createCallRef>>("callRef")(ref, input, opts);
}
