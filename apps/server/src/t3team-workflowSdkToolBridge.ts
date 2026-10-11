import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import {
  executeRegisteredTool,
  type FetchLike,
  type T3TeamToolHandlerClient,
  type ToolHandlerCtx,
  type ToolRef,
  type ToolWorkspace,
} from "@t3team/sdk";
import type {
  ListRecipesToolResult,
  ValidateRecipeToolResult,
} from "@t3team/sdk/tools/t3teamRecipes";
import type { RunWorkflowToolResult, WorkflowRunIntent } from "@t3team/sdk/tools/t3teamWorkflow";
// Importing the tool modules registers `t3team.recipe.*` / `t3team.orchestration.run` in the SDK
// tool registry.
import "@t3team/sdk/tools/t3teamRecipes";
import "@t3team/sdk/tools/t3teamWorkflow";

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

function baseToolHandlerCtx(t3team: T3TeamToolHandlerClient): ToolHandlerCtx {
  return {
    workspaceRoot: "",
    log: noopLog,
    fetch: unsupportedFetch,
    workspace: unsupportedWorkspace,
    callTool: unsupportedCallTool,
    t3team,
  };
}

/** Execute `t3team.orchestration.run` through the SDK tool registry (arg decode + result check). */
export function executeWorkflowSdkWorkflowRunTool(input: {
  readonly toolArgs: unknown;
  readonly runWorkflow: (args: {
    readonly source?: string;
    readonly workflowPath?: string;
    readonly recipe?: string;
    readonly action?: string;
    readonly args?: unknown;
    readonly intent: WorkflowRunIntent;
    readonly replaceRunId?: string;
  }) => Effect.Effect<RunWorkflowToolResult, WorkflowSdkBridgeError>;
}): Effect.Effect<RunWorkflowToolResult, WorkflowSdkBridgeError> {
  return Effect.tryPromise({
    try: () =>
      executeRegisteredTool(
        "t3team.orchestration.run",
        input.toolArgs,
        baseToolHandlerCtx({
          runWorkflow: (args) => Effect.runPromise(input.runWorkflow(args)),
        }),
      ) as Promise<RunWorkflowToolResult>,
    catch: toWorkflowSdkBridgeError,
  });
}

export type WorkflowSdkRecipeToolResult = ListRecipesToolResult | ValidateRecipeToolResult;

/** Execute `t3team.recipe.list` / `t3team.recipe.validate` through the SDK tool registry. */
export function executeWorkflowSdkRecipeTool(input: {
  readonly toolId: "t3team.recipe.list" | "t3team.recipe.validate";
  readonly toolArgs: unknown;
  readonly listRecipes: () => Effect.Effect<ListRecipesToolResult, WorkflowSdkBridgeError>;
  readonly validateRecipe: (args: {
    readonly path?: string;
    readonly source?: string;
  }) => Effect.Effect<ValidateRecipeToolResult, WorkflowSdkBridgeError>;
}): Effect.Effect<WorkflowSdkRecipeToolResult, WorkflowSdkBridgeError> {
  return Effect.tryPromise({
    try: () =>
      executeRegisteredTool(
        input.toolId,
        input.toolArgs,
        baseToolHandlerCtx({
          listRecipes: () => Effect.runPromise(input.listRecipes()),
          validateRecipe: (args) => Effect.runPromise(input.validateRecipe(args)),
        }),
      ) as Promise<WorkflowSdkRecipeToolResult>,
    catch: toWorkflowSdkBridgeError,
  });
}
