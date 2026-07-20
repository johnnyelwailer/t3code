import * as Effect from "effect/Effect";

import type { ListRecipesToolResult, ValidateRecipeToolResult } from "@t3work/sdk";

import type { T3workToolCallResult } from "./t3work-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3work-toolBrokerHelpers.ts";
import {
  executeWorkflowSdkRecipeTool,
  WorkflowSdkBridgeError,
} from "./t3work-workflowSdkToolBridge.ts";

export type T3workRecipeToolId = "t3work.recipe.list" | "t3work.recipe.validate";

export function isT3workRecipeTool(tool: string): tool is T3workRecipeToolId {
  return tool === "t3work.recipe.list" || tool === "t3work.recipe.validate";
}

/** Host-side recipe tool handlers, already bound to the calling thread's workspace root. */
export type T3workRecipeToolHandlers = {
  readonly listRecipes: () => Effect.Effect<ListRecipesToolResult, string>;
  readonly validateRecipe: (args: {
    readonly path?: string;
    readonly source?: string;
  }) => Effect.Effect<ValidateRecipeToolResult, string>;
};

export function callT3workRecipeTool(input: {
  readonly tool: T3workRecipeToolId;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly recipeTools?: T3workRecipeToolHandlers;
}): Effect.Effect<T3workToolCallResult, never> {
  const recipeTools = input.recipeTools;
  if (!recipeTools) {
    return Effect.succeed(errorResult(`Tool '${input.tool}' is not enabled ${input.scopeLabel}.`));
  }

  const toBridgeError = (message: string) =>
    new WorkflowSdkBridgeError({ message, cause: message });
  return foldResult(
    executeWorkflowSdkRecipeTool({
      toolId: input.tool,
      toolArgs: input.toolArgs,
      listRecipes: () => recipeTools.listRecipes().pipe(Effect.mapError(toBridgeError)),
      validateRecipe: (args) =>
        recipeTools.validateRecipe(args).pipe(Effect.mapError(toBridgeError)),
    }),
    okResult,
    (message) =>
      errorResult(
        message.startsWith(`${input.tool} requires`)
          ? message
          : `Failed to run ${input.tool}: ${message}`,
      ),
  );
}
