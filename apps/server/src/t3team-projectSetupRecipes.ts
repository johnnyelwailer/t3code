import { listBundledT3TeamRecipes } from "@t3tools/t3team-skill-packs";

import {
  T3TEAM_PROJECT_RECIPES_ROOT,
  type T3TeamProjectSetupFile,
} from "./t3team-projectSetupShared.ts";
import { renderBundledRecipeModule } from "./t3team-projectSetupRecipeModule.ts";
import { descriptionRewriteSetupFiles } from "./t3team-projectSetupDescriptionRewriteRecipe.ts";
import { workItemDeliverySetupFiles } from "./t3team-projectSetupWorkItemDeliveryRecipes.ts";

function renderBundledRecipePrompt(
  recipe: ReturnType<typeof listBundledT3TeamRecipes>[number],
): string {
  return recipe.promptTemplate
    ? `# ${recipe.title}\n\n${recipe.shortDescription}\n\n## Prompt\n\n${recipe.promptTemplate}\n`
    : `# ${recipe.title}\n\n${recipe.shortDescription}\n\n## Prompt\n\nThis recipe runs as a deterministic workflow and does not require an agent prompt.\n`;
}

/** The workflow files a bundled recipe scaffolds beside its `recipe.ts`; empty for prompt-only ones. */
function bundledRecipeWorkflowFiles(recipeId: string): ReadonlyArray<T3TeamProjectSetupFile> {
  return [...descriptionRewriteSetupFiles(recipeId), ...workItemDeliverySetupFiles(recipeId)];
}

export function renderBundledRecipeSetupFiles(): ReadonlyArray<T3TeamProjectSetupFile> {
  return listBundledT3TeamRecipes().flatMap((recipe): ReadonlyArray<T3TeamProjectSetupFile> => {
    const workflowFiles = bundledRecipeWorkflowFiles(recipe.id);
    return [
      {
        relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/${recipe.id}/recipe.ts`,
        contents: renderBundledRecipeModule(
          recipe,
          workflowFiles.length > 0 ? "./workflow.ts" : undefined,
        ),
        writeMode: "if-missing",
      },
      {
        relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/${recipe.id}/prompt.md`,
        contents: renderBundledRecipePrompt(recipe),
        writeMode: "if-missing",
      },
      ...workflowFiles,
    ];
  });
}
