import { describe, expect, it } from "vite-plus/test";

import {
  renderTypedRecipeModuleStarter,
  renderTypedRecipeStarterReadme,
  renderTypedWorkflowModuleStarter,
} from "./t3work-projectSetupRecipeScaffolding.ts";
import { renderBundledRecipeSetupFiles } from "./t3work-projectSetupRecipes.ts";

describe("renderTypedRecipeModuleStarter", () => {
  it("emits a defineRecipe module wired to a typed workflow import", () => {
    const source = renderTypedRecipeModuleStarter();

    expect(source).toContain('import { defineRecipe, defineWorkflow } from "@t3work/sdk"');
    expect(source).toContain(
      'import type * as ExampleWorkflow from "./example-recipe.workflow.ts"',
    );
    expect(source).toContain("export default defineRecipe({");
    expect(source).toContain(
      'defaultAction: defineWorkflow<typeof ExampleWorkflow>("./example-recipe.workflow.ts")',
    );
    expect(source).toContain('defaults: { prompt: "Summarize the current work item." }');
  });
});

describe("renderTypedWorkflowModuleStarter", () => {
  it("emits Inputs, Outputs, meta, and an agent body", () => {
    const source = renderTypedWorkflowModuleStarter();

    expect(source).toContain("export const Inputs = Schema.Struct({");
    expect(source).toContain("export const Outputs = Schema.Struct({");
    expect(source).toContain('capabilities: ["user"]');
    expect(source).toContain("await agent(input.prompt, { schema: Summary })");
  });
});

describe("create-recipe bundled scaffolding", () => {
  it("writes typed starter modules through the create-recipe script", () => {
    const script = renderBundledRecipeSetupFiles().find(
      (file) => file.relativePath === ".t3work/recipes/create-recipe/recipe-script.ts",
    );
    const workflow = renderBundledRecipeSetupFiles().find(
      (file) => file.relativePath === ".t3work/recipes/create-recipe/workflow.ts",
    );

    expect(script?.contents).toContain('writeText("starter/recipe.ts", STARTER_RECIPE_TS)');
    expect(script?.contents).toContain(
      'writeText("starter/example-recipe.workflow.ts", STARTER_WORKFLOW_TS)',
    );
    expect(script?.contents).not.toContain("starter/recipe.json");
    expect(script?.contents).toContain("STARTER_RECIPE_TS");
    expect(script?.contents).toContain("defineRecipe");
    expect(script?.contents).toContain("example-recipe.workflow.ts");
    expect(renderTypedRecipeStarterReadme()).toContain("recipe.ts");
    expect(workflow?.contents).toContain("defineRecipe + defineWorkflow");
  });
});
