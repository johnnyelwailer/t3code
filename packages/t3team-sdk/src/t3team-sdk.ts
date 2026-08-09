import * as Schema from "effect/Schema";

import { createToolGroup, createToolRef, executeToolHandler } from "@runbook/tools";
import { createScriptRef, executeScriptHandler } from "@runbook/scripts";
import { defineModel as defineGenericModel } from "@runbook/threads/models";

import {
  duplicateRegistrationError,
  ensureWorkflowPathExists,
  getRegistry,
  resolveWorkflowAbsolutePath,
  runtimeStorage,
  setNestedValue,
} from "./t3team-sdk.internal.ts";
import type * as T from "./t3team-sdk.types.ts";

export type * from "./t3team-sdk.types.ts";
export {
  DEFAULT_RECIPE_ACTION_NAME,
  defineRecipe,
  getRegisteredRecipe,
  listRegisteredRecipes,
} from "./t3team-sdk.recipe.ts";
export { definePrompt, isPromptRef, type PromptRef } from "./t3team-sdk.prompt.ts";

export function withWorkflowRuntime<T>(
  runtime: T.WorkflowRuntime,
  run: () => Promise<T>,
): Promise<T> {
  return runtimeStorage.run(runtime, run);
}

export function defineWorkflow<TModule, const Path extends string = string>(
  path: Path,
): T.WorkflowRef<T.WorkflowInputs<TModule>, T.WorkflowOutputs<TModule>, Path> {
  const resolvedPath = resolveWorkflowAbsolutePath(path);
  ensureWorkflowPathExists(path, resolvedPath.absolutePath, resolvedPath.callerFilePath);

  return Object.freeze({
    kind: "workflow" as const,
    path,
    absolutePath: resolvedPath.absolutePath,
  }) as T.WorkflowRef<T.WorkflowInputs<TModule>, T.WorkflowOutputs<TModule>, Path>;
}

export function defineToolGroup<const Id extends string>(opts: {
  readonly id: Id;
  readonly label: string;
  readonly description: string;
}): T.ToolGroupRef<Id> {
  const registry = getRegistry();
  if (registry.toolGroups.has(opts.id)) {
    throw duplicateRegistrationError("tool group", opts.id);
  }

  const ref = createToolGroup(opts) as T.ToolGroupRef<Id>;

  registry.toolGroups.set(opts.id, ref as T.AnyToolGroupRef);
  return ref;
}

export function defineModel<const Provider extends string, const Id extends string>(opts: {
  readonly provider: Provider;
  readonly id: Id;
}): T.ModelRef<Id, Provider> {
  return defineGenericModel(opts);
}

export function defineTool<const Id extends string, Group extends T.ToolGroupRef, I, R>(opts: {
  readonly id: Id;
  readonly group: Group;
  readonly args: Schema.Schema<I>;
  readonly result: Schema.Schema<R>;
  readonly handler: (args: I, ctx: T.ToolHandlerCtx) => Promise<R>;
}): T.ToolRef<I, R, Id, Group> {
  const registry = getRegistry();
  if (registry.tools.has(opts.id)) {
    throw duplicateRegistrationError("tool", opts.id);
  }

  const ref = createToolRef({
    ...opts,
    dispatch: (target, args) => {
      const runtime = runtimeStorage.getStore();
      if (!runtime) {
        throw new Error(
          `Tool '${opts.id}' was called outside a workflow runtime. Use withWorkflowRuntime(...) or executeToolHandler(...).`,
        );
      }

      // Canonical dispatch: the engine's `runtime.callTool` validates args + result and
      // journals exactly once. A directly-called ref forwards raw args (no decode here) so
      // this path and the `tools.*` tree path are identical — same hash, no spurious drift.
      return runtime.callTool(target as T.ToolRef<I, R, Id, Group>, args);
    },
  }) as T.ToolRef<I, R, Id, Group>;

  registry.tools.set(opts.id, ref as T.AnyToolRef);
  return ref;
}

export function defineScript<I, O>(opts: {
  readonly inputs: Schema.Schema<I>;
  readonly outputs: Schema.Schema<O>;
  readonly handler: (args: I, ctx: T.ScriptHandlerCtx) => Promise<O>;
  readonly replay?: "default" | "never";
}): T.ScriptRef<I, O> {
  const ref = createScriptRef({
    ...opts,
    dispatch: (target, args) => {
      const runtime = runtimeStorage.getStore();
      if (!runtime) {
        throw new Error(
          "Script refs require a workflow runtime dispatcher. Use withWorkflowRuntime(...) or executeScriptHandler(...).",
        );
      }

      // Canonical dispatch — see the note in defineTool's callable. The engine validates and
      // journals; forwarding raw args keeps the direct-call and `scripts.*` tree paths aligned.
      return runtime.callScript(target as T.ScriptRef<I, O>, args);
    },
  }) as T.ScriptRef<I, O>;

  return ref;
}

export { executeScriptHandler, executeToolHandler };

export async function executeRegisteredTool(
  toolId: string,
  args: unknown,
  ctx: T.ToolHandlerCtx,
): Promise<unknown> {
  const ref = getRegistry().tools.get(toolId);
  if (!ref) {
    throw new Error(`Unknown workflow SDK tool '${toolId}'.`);
  }

  return await executeToolHandler(ref, args, ctx);
}

export function getRegisteredTool(toolId: string): T.AnyToolRef | undefined {
  return getRegistry().tools.get(toolId);
}

export function getRegisteredToolGroup(groupId: string): T.AnyToolGroupRef | undefined {
  return getRegistry().toolGroups.get(groupId);
}

export function listRegisteredTools(): ReadonlyArray<T.AnyToolRef> {
  return Object.freeze(Array.from(getRegistry().tools.values()));
}

export function listRegisteredToolGroups(): ReadonlyArray<T.AnyToolGroupRef> {
  return Object.freeze(Array.from(getRegistry().toolGroups.values()));
}

export function buildToolTree<const TRefs extends readonly { readonly id: string }[]>(
  refs: TRefs,
): T.ToolTreeFromRefs<TRefs> {
  const root: Record<string, unknown> = {};

  for (const ref of refs) {
    setNestedValue(root, ref.id, ref);
  }

  return root as T.ToolTreeFromRefs<TRefs>;
}

export function buildScriptTree<const TScripts extends Record<string, T.AnyScriptRef>>(
  scripts: TScripts,
): T.ScriptTreeFromRecord<TScripts> {
  return Object.freeze({ ...scripts }) as T.ScriptTreeFromRecord<TScripts>;
}
