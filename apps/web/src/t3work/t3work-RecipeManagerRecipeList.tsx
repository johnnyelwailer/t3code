import type { ManagedProjectRecipe } from "@t3tools/project-recipes";

import { RecipeManagerCard } from "~/t3work/t3work-RecipeManagerCard";
import type { ManagedProjectRecipeGroup } from "~/t3work/t3work-recipeManagerModel";

export function RecipeManagerRecipeList({
  groups,
  selectedRecipePath,
  onSelectRecipe,
}: {
  readonly groups: ReadonlyArray<ManagedProjectRecipeGroup>;
  readonly selectedRecipePath: string | null;
  readonly onSelectRecipe: (recipe: ManagedProjectRecipe) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-2">
      {groups.map((group) => (
        <section key={group.topic} aria-label={`${group.topic} recipes`}>
          <h3 className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.topic}
          </h3>
          <div className="flex flex-col gap-1">
            {group.recipes.map((recipe) => (
              <RecipeManagerCard
                key={recipe.recipePath}
                recipe={recipe}
                selected={recipe.recipePath === selectedRecipePath}
                onSelect={() => onSelectRecipe(recipe)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
