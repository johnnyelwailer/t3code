import { listBundledT3TeamRecipes } from "@t3tools/t3team-skill-packs";

import {
  T3TEAM_PROJECT_RECIPES_ROOT,
  type T3TeamProjectSetupFile,
} from "./t3team-projectSetupShared.ts";
import { renderBundledRecipeModule } from "./t3team-projectSetupRecipeModule.ts";
import {
  DESCRIPTION_REWRITE_RECIPE_ID,
  descriptionRewriteSetupFiles,
} from "./t3team-projectSetupDescriptionRewriteRecipe.ts";

function renderBundledRecipePrompt(
  recipe: ReturnType<typeof listBundledT3TeamRecipes>[number],
): string {
  return recipe.promptTemplate
    ? `# ${recipe.title}\n\n${recipe.shortDescription}\n\n## Prompt\n\n${recipe.promptTemplate}\n`
    : `# ${recipe.title}\n\n${recipe.shortDescription}\n\n## Prompt\n\nThis recipe runs as a deterministic workflow and does not require an agent prompt.\n`;
}

export function renderBundledRecipeSetupFiles(): ReadonlyArray<T3TeamProjectSetupFile> {
  return listBundledT3TeamRecipes().flatMap((recipe) => {
    const files: Array<T3TeamProjectSetupFile> = [
      {
        relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/${recipe.id}/recipe.ts`,
        contents: renderBundledRecipeModule(
          recipe,
          recipe.id === DESCRIPTION_REWRITE_RECIPE_ID ? "./workflow.ts" : undefined,
        ),
        writeMode: "if-missing",
      },
      {
        relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/${recipe.id}/prompt.md`,
        contents: renderBundledRecipePrompt(recipe),
        writeMode: "if-missing",
      },
    ];

    files.push(...descriptionRewriteSetupFiles(recipe.id));

    return files;
  });
}
