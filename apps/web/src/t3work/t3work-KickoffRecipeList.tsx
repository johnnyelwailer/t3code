import { autoAnimate } from "@formkit/auto-animate";
import { Fragment, useCallback, useRef, type ReactNode } from "react";

import type { T3workRecipeQuickStartLaunchCustomization } from "~/t3work/t3work-recipeQuickStartLaunch";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

import { T3workRecipeListCard } from "~/t3work/t3work-RecipeListCard";

const RECIPE_LIST_ANIMATION_OPTIONS = {
  duration: 180,
  easing: "ease-out",
} as const;

export function T3workKickoffRecipeList({
  recipes,
  onSelectRecipe,
  selectedRecipeId,
  renderRecipe,
}: {
  recipes: ReadonlyArray<T3workSidecarRecipeQuickStart>;
  onSelectRecipe: (
    recipe: T3workSidecarRecipeQuickStart,
    customization?: T3workRecipeQuickStartLaunchCustomization,
  ) => void;
  selectedRecipeId?: string;
  renderRecipe?:
    | ((recipe: T3workSidecarRecipeQuickStart, content: ReactNode) => ReactNode)
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
          <T3workRecipeListCard
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
