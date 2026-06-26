/** String templates for typed recipe authoring starters (recipe.ts + .workflow.ts). */

export function renderTypedWorkflowModuleStarter(): string {
  return [
    'import { Schema } from "effect";',
    "",
    "export const Inputs = Schema.Struct({",
    "  prompt: Schema.String,",
    "});",
    "",
    "export const Outputs = Schema.Struct({",
    "  summary: Schema.String,",
    "});",
    "",
    "export const meta = {",
    '  name: "example.recipe.kickoff",',
    '  description: "Run a short agent turn and return a summary.",',
    "  inputs: Inputs,",
    "  outputs: Outputs,",
    '  capabilities: ["user"],',
    "} as const;",
    "",
    "const input = Schema.decodeSync(Inputs)(args);",
    "",
    "const Summary = Schema.Struct({ summary: Schema.String });",
    "const result = await agent(input.prompt, { schema: Summary });",
    "",
    "return { summary: result.summary };",
    "",
  ].join("\n");
}

export function renderTypedRecipeModuleStarter(): string {
  return [
    'import { defineRecipe, defineWorkflow } from "@t3work/sdk";',
    "",
    'import type * as ExampleWorkflow from "./example-recipe.workflow.ts";',
    "",
    "export default defineRecipe({",
    '  id: "example-recipe",',
    '  version: "0.1.0",',
    '  scope: "project",',
    '  title: "Example recipe",',
    '  shortDescription: "Describe what the recipe does.",',
    '  surfaces: ["workitem.detail.sidepanel"],',
    '  defaultAction: defineWorkflow<typeof ExampleWorkflow>("./example-recipe.workflow.ts"),',
    '  defaults: { prompt: "Summarize the current work item." },',
    "});",
    "",
  ].join("\n");
}

export function renderTypedRecipeStarterReadme(): string {
  return [
    "Use these starter files as a reference while creating a new recipe under ../<recipe-id>.",
    "",
    "Preferred layout:",
    "- recipe.ts — typed recipe module (`defineRecipe` + `defineWorkflow`)",
    "- <recipe-id>.workflow.ts — typed workflow module (`Inputs`, `Outputs`, `meta`, body)",
    "- prompt.md — optional kickoff copy when the recipe still needs a legacy prompt surface",
    "",
    "Legacy recipe.json is still supported for discovery, but new recipes should start from the typed modules.",
    "",
  ].join("\n");
}
