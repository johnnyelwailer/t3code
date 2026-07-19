import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import {
  executeRegisteredTool,
  type FetchLike,
  type T3workToolHandlerClient,
  type ToolHandlerCtx,
  type ToolRef,
  type ToolWorkspace,
} from "@t3work/sdk";
import { renameThreadTool, type RenameThreadToolResult } from "@t3work/sdk/tools/t3work";
import type {
  ListRecipesToolResult,
  ValidateRecipeToolResult,
} from "@t3work/sdk/tools/t3workRecipes";
import type { RunWorkflowToolResult, WorkflowRunIntent } from "@t3work/sdk/tools/t3workWorkflow";
// Importing the tool modules registers `t3work.recipe.*` / `t3work.workflow.run` in the SDK
// tool registry.
import "@t3work/sdk/tools/t3workRecipes";
import "@t3work/sdk/tools/t3workWorkflow";

export class WorkflowSdkBridgeError extends Data.TaggedError("WorkflowSdkBridgeError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const unsupportedFetch: FetchLike = async () => {
  throw new Error("Fetch is not wired in this workflow-sdk bridge.");
};

const noopLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as const;

const unsupportedWorkspace: ToolWorkspace = {
  readText: async () => {
    throw new Error("Workspace reads are not wired in this workflow-sdk bridge.");
  },
  writeText: async () => {
    throw new Error("Workspace writes are not wired in this workflow-sdk bridge.");
  },
  exists: async () => false,
};

const unsupportedCallTool: ToolHandlerCtx["callTool"] = async <I, R>(
  _ref: ToolRef<I, R>,
  _args: I,
): Promise<R> => {
  throw new Error("Cross-tool workflow-sdk dispatch is not wired in this runtime.");
};

function toWorkflowSdkBridgeError(error: unknown): WorkflowSdkBridgeError {
  return new WorkflowSdkBridgeError({
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}

function baseToolHandlerCtx(t3work: T3workToolHandlerClient): ToolHandlerCtx {
  return {
    workspaceRoot: "",
    log: noopLog,
    fetch: unsupportedFetch,
    workspace: unsupportedWorkspace,
    callTool: unsupportedCallTool,
    t3work,
  };
}

const unsupportedRenameThread: T3workToolHandlerClient["renameThread"] = async () => {
  throw new Error("t3work.thread.rename is not wired for this tool call.");
};

export function executeWorkflowSdkThreadRename(input: {
  readonly toolArgs: unknown;
  readonly renameThread: (title: string) => Effect.Effect<unknown, WorkflowSdkBridgeError>;
  readonly renameThreadResult?: (title: string) => unknown;
}): Effect.Effect<RenameThreadToolResult, WorkflowSdkBridgeError> {
  return Effect.tryPromise({
    try: () =>
      executeRegisteredTool(
        renameThreadTool.id,
        input.toolArgs,
        baseToolHandlerCtx({
          renameThread: async ({ title }) => {
            await Effect.runPromise(input.renameThread(title));
            const result = input.renameThreadResult
              ? input.renameThreadResult(title)
              : { ok: true as const, title };
            return result as RenameThreadToolResult;
          },
        }),
      ) as Promise<RenameThreadToolResult>,
    catch: toWorkflowSdkBridgeError,
  });
}

/** Execute `t3work.workflow.run` through the SDK tool registry (arg decode + result check). */
export function executeWorkflowSdkWorkflowRunTool(input: {
  readonly toolArgs: unknown;
  readonly runWorkflow: (args: {
    readonly source?: string;
    readonly workflowPath?: string;
    readonly args?: unknown;
    readonly intent: WorkflowRunIntent;
  }) => Effect.Effect<RunWorkflowToolResult, WorkflowSdkBridgeError>;
}): Effect.Effect<RunWorkflowToolResult, WorkflowSdkBridgeError> {
  return Effect.tryPromise({
    try: () =>
      executeRegisteredTool(
        "t3work.workflow.run",
        input.toolArgs,
        baseToolHandlerCtx({
          renameThread: unsupportedRenameThread,
          runWorkflow: (args) => Effect.runPromise(input.runWorkflow(args)),
        }),
      ) as Promise<RunWorkflowToolResult>,
    catch: toWorkflowSdkBridgeError,
  });
}

export type WorkflowSdkRecipeToolResult = ListRecipesToolResult | ValidateRecipeToolResult;

/** Execute `t3work.recipe.list` / `t3work.recipe.validate` through the SDK tool registry. */
export function executeWorkflowSdkRecipeTool(input: {
  readonly toolId: "t3work.recipe.list" | "t3work.recipe.validate";
  readonly toolArgs: unknown;
  readonly listRecipes: () => Effect.Effect<ListRecipesToolResult, WorkflowSdkBridgeError>;
  readonly validateRecipe: (args: {
    readonly path: string;
  }) => Effect.Effect<ValidateRecipeToolResult, WorkflowSdkBridgeError>;
}): Effect.Effect<WorkflowSdkRecipeToolResult, WorkflowSdkBridgeError> {
  return Effect.tryPromise({
    try: () =>
      executeRegisteredTool(
        input.toolId,
        input.toolArgs,
        baseToolHandlerCtx({
          renameThread: unsupportedRenameThread,
          listRecipes: () => Effect.runPromise(input.listRecipes()),
          validateRecipe: (args) => Effect.runPromise(input.validateRecipe(args)),
        }),
      ) as Promise<WorkflowSdkRecipeToolResult>,
    catch: toWorkflowSdkBridgeError,
  });
}
