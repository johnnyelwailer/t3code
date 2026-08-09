/**
 * Renders a bundled starter recipe as a typed `recipe.ts` module (Epic 16 §Plugin Modules).
 *
 * These starters used to be scaffolded as `recipe.json` + `prompt.md`, which is what kept the
 * legacy manifest path alive: most of them are prompt-only, and the module form had no way to
 * express a prompt. `definePrompt` closed that, so the starters can now ship in the one form
 * discovery supports — and the `{{ }}` expression engines behind the manifest could be deleted.
 *
 * The prompt file is unchanged: `definePrompt("./prompt.md")` points at exactly the `prompt.md`
 * the manifest's `prompt` field pointed at.
 */

import type { listBundledT3TeamRecipes } from "@t3tools/t3team-skill-packs";

type BundledRecipe = ReturnType<typeof listBundledT3TeamRecipes>[number];

/** `outputPreference` is deliberately absent: the manifest schema never decoded it either. */
function recipeFields(recipe: BundledRecipe): ReadonlyArray<string> {
  return [
    `  id: ${JSON.stringify(recipe.id)},`,
    `  version: ${JSON.stringify(recipe.version)},`,
    `  scope: "project",`,
    `  title: ${JSON.stringify(recipe.manifestDisplayName)},`,
    `  shortDescription: ${JSON.stringify(recipe.shortDescription)},`,
    ...(recipe.icon ? [`  icon: ${JSON.stringify(recipe.icon)},`] : []),
    `  surfaces: ${JSON.stringify(recipe.surfaces)},`,
    `  allowedToolGroups: ${JSON.stringify(recipe.allowedToolGroups ?? [])},`,
  ];
}

/**
 * @param workflowFile Recipe-relative workflow path for the starters that ship one; when absent the
 * recipe's default action is its prompt.
 */
export function renderBundledRecipeModule(recipe: BundledRecipe, workflowFile?: string): string {
  const imports = workflowFile
    ? [
        `import { defineRecipe, defineWorkflow } from "@t3team/sdk";`,
        ``,
        `import type * as Workflow from ${JSON.stringify(workflowFile)};`,
      ]
    : [`import { definePrompt, defineRecipe } from "@t3team/sdk";`];
  const defaultAction = workflowFile
    ? `  defaultAction: defineWorkflow<typeof Workflow>(${JSON.stringify(workflowFile)}),`
    : `  defaultAction: definePrompt("./prompt.md"),`;

  return [
    ...imports,
    ``,
    `export default defineRecipe({`,
    ...recipeFields(recipe),
    defaultAction,
    `});`,
    ``,
  ].join("\n");
}
