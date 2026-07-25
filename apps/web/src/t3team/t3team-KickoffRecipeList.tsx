import { autoAnimate } from "@formkit/auto-animate";
import { Fragment, useCallback, useRef, type ReactNode } from "react";

import type { T3TeamRecipeQuickStartLaunchCustomization } from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipes";

import { T3TeamRecipeListCard } from "~/t3team/t3team-RecipeListCard";

const RECIPE_LIST_ANIMATION_OPTIONS = {
  duration: 180,
  easing: "ease-out",
} as const;

export function T3TeamKickoffRecipeList({
  recipes,
  onSelectRecipe,
  selectedRecipeId,
  renderRecipe,
}: {
  recipes: ReadonlyArray<T3TeamSidecarRecipeQuickStart>;
  onSelectRecipe: (
    recipe: T3TeamSidecarRecipeQuickStart,
    customization?: T3TeamRecipeQuickStartLaunchCustomization,
  ) => void;
  selectedRecipeId?: string;
  renderRecipe?:
    | ((recipe: T3TeamSidecarRecipeQuickStart, content: ReactNode) => ReactNode)
    | undefined;
}) {
  const animatedRecipeListsRef = useRef(new WeakSet<HTMLElement>());
  const attachRecipeListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedRecipeListsRef.current.has(node)) {
      return;
    }

    autoAnimate(node, RECIPE_LIST_ANIMATION_OPTIONS);
    animatedRecipeListsRef.current.add(node);
  }, []);

  return (
    <div ref={attachRecipeListAutoAnimateRef} className="space-y-2.5">
      {recipes.map((recipe) => {
        const isSelected = recipe.id === selectedRecipeId;
        const content = (
          <T3TeamRecipeListCard
            recipe={recipe}
            isSelected={isSelected}
            onSelectRecipe={(customization) => onSelectRecipe(recipe, customization)}
          />
        );

        return (
          <Fragment key={recipe.id}>
            {renderRecipe ? renderRecipe(recipe, content) : content}
          </Fragment>
        );
      })}
    </div>
  );
}
