import * as Effect from "effect/Effect";

import type { ListRecipesToolResult, ValidateRecipeToolResult } from "@t3team/sdk";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import {
  executeWorkflowSdkRecipeTool,
  WorkflowSdkBridgeError,
} from "./t3team-workflowSdkToolBridge.ts";

export type T3TeamRecipeToolId = "t3team.recipe.list" | "t3team.recipe.validate";

export function isT3TeamRecipeTool(tool: string): tool is T3TeamRecipeToolId {
  return tool === "t3team.recipe.list" || tool === "t3team.recipe.validate";
}

/** Host-side recipe tool handlers, already bound to the calling thread's workspace root. */
export type T3TeamRecipeToolHandlers = {
  readonly listRecipes: () => Effect.Effect<ListRecipesToolResult, string>;
  readonly validateRecipe: (args: {
    readonly path?: string;
    readonly source?: string;
  }) => Effect.Effect<ValidateRecipeToolResult, string>;
};

export function callT3TeamRecipeTool(input: {
  readonly tool: T3TeamRecipeToolId;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly recipeTools?: T3TeamRecipeToolHandlers;
}): Effect.Effect<T3TeamToolCallResult, never> {
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
