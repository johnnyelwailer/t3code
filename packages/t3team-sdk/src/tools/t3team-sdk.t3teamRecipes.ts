/**
 * Agent-facing t3team project-recipe tools (read-only). Both delegate to a host-provided
 * `ctx.t3team` client — the SDK layer owns the ids, argument/result schemas, and group
 * classification; the server broker supplies the filesystem-backed implementation.
 */
import * as Schema from "effect/Schema";

import { t3teamRecipeRead } from "../t3team-sdk.groups.ts";
import { defineTool } from "../t3team-sdk.ts";

/** One structured, agent-actionable problem found while discovering/loading/validating. */
export const RecipeToolIssue = Schema.Struct({
  path: Schema.String,
  phase: Schema.Literals(["discover", "load", "meta", "shape"]),
  message: Schema.String,
});
export type RecipeToolIssue = typeof RecipeToolIssue.Type;

export const ListRecipesToolArgs = Schema.Struct({});
export type ListRecipesToolArgs = typeof ListRecipesToolArgs.Type;

export const RecipeListEntry = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  shortDescription: Schema.String,
  surfaces: Schema.Array(Schema.String),
  /** How the recipe is authored: a typed `recipe.ts` module or a legacy `recipe.json` manifest. */
  authoring: Schema.Literals(["recipe-ts", "recipe-json"]),
  recipePath: Schema.String,
  workflowPath: Schema.optional(Schema.String),
});
export type RecipeListEntry = typeof RecipeListEntry.Type;

export const ListRecipesToolResult = Schema.Struct({
  ok: Schema.Literal(true),
  workspaceRoot: Schema.String,
  recipes: Schema.Array(RecipeListEntry),
  errors: Schema.Array(RecipeToolIssue),
});
export type ListRecipesToolResult = typeof ListRecipesToolResult.Type;

export const ValidateRecipeToolArgs = Schema.Struct({
  path: Schema.String,
});
export type ValidateRecipeToolArgs = typeof ValidateRecipeToolArgs.Type;

/** Serializable summary of the statically-extracted `meta` block. */
export const RecipeWorkflowMetaSummary = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  capabilities: Schema.optional(Schema.Array(Schema.String)),
  inputFields: Schema.optional(Schema.Array(Schema.String)),
  outputFields: Schema.optional(Schema.Array(Schema.String)),
  phases: Schema.optional(Schema.Array(Schema.Struct({ title: Schema.String }))),
});
export type RecipeWorkflowMetaSummary = typeof RecipeWorkflowMetaSummary.Type;

/** The same play-as-shape descriptor the UI preview shows (`deriveWorkflowShape`). */
export const RecipeWorkflowShapeSummary = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  phases: Schema.Array(Schema.Struct({ title: Schema.String })),
  steps: Schema.Array(
    Schema.Struct({
      phase: Schema.NullOr(Schema.String),
      kind: Schema.Literals(["read", "agent", "ask", "act"]),
      label: Schema.String,
    }),
  ),
});
export type RecipeWorkflowShapeSummary = typeof RecipeWorkflowShapeSummary.Type;

export const ValidateRecipeToolResult = Schema.Struct({
  ok: Schema.Boolean,
  workflowPath: Schema.optional(Schema.String),
  meta: Schema.optional(RecipeWorkflowMetaSummary),
  shape: Schema.optional(RecipeWorkflowShapeSummary),
  errors: Schema.Array(RecipeToolIssue),
});
export type ValidateRecipeToolResult = typeof ValidateRecipeToolResult.Type;

export const listRecipesTool = defineTool({
  id: "t3team.recipe.list",
  group: t3teamRecipeRead,
  args: ListRecipesToolArgs,
  result: ListRecipesToolResult,
  handler: async (_args, ctx) => {
    if (!ctx.t3team?.listRecipes) {
      throw new Error("t3team.recipe.list requires a t3team recipe client in ToolHandlerCtx.");
    }
    // The host result is re-validated against ListRecipesToolResult by executeToolHandler.
    return (await ctx.t3team.listRecipes()) as ListRecipesToolResult;
  },
});

export const validateRecipeTool = defineTool({
  id: "t3team.recipe.validate",
  group: t3teamRecipeRead,
  args: ValidateRecipeToolArgs,
  result: ValidateRecipeToolResult,
  handler: async (args, ctx) => {
    const path = args.path.trim();
    if (path.length === 0) {
      throw new Error("t3team.recipe.validate requires a non-empty 'path'.");
    }
    if (!ctx.t3team?.validateRecipe) {
      throw new Error("t3team.recipe.validate requires a t3team recipe client in ToolHandlerCtx.");
    }
    // The host result is re-validated against ValidateRecipeToolResult by executeToolHandler.
    return (await ctx.t3team.validateRecipe({ path })) as ValidateRecipeToolResult;
  },
});
