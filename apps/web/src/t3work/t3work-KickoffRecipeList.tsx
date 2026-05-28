import { autoAnimate } from "@formkit/auto-animate";
import { useCallback, useRef } from "react";

import {
  areT3workRecipeQuickStartLaunchCustomizationsEqual,
  type T3workRecipeQuickStartLaunchCustomization,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import { cn } from "~/lib/utils";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

import { T3workRecipeQuickStartBody } from "~/t3work/t3work-recipeActionView";

const INTERACTIVE_SELECTOR = "button, input, select, textarea, a, [role='button'], label";
const RECIPE_LIST_ANIMATION_OPTIONS = {
  duration: 180,
  easing: "ease-out",
} as const;

function RichRecipeCard({
  recipe,
  isSelected,
  onSelectRecipe,
}: {
  recipe: T3workSidecarRecipeQuickStart;
  isSelected: boolean;
  onSelectRecipe: (
    recipe: T3workSidecarRecipeQuickStart,
    customization?: T3workRecipeQuickStartLaunchCustomization,
  ) => void;
}) {
  // Keep stable refs so callbacks never go stale without re-mounting.
  const isSelectedRef = useRef(isSelected);
  isSelectedRef.current = isSelected;
  const onSelectRef = useRef(onSelectRecipe);
  onSelectRef.current = onSelectRecipe;
  const latestCustomizationRef = useRef<T3workRecipeQuickStartLaunchCustomization | undefined>(
    undefined,
  );

  const handleCustomizationChange = useCallback(
    (customization: T3workRecipeQuickStartLaunchCustomization | undefined) => {
      if (
        areT3workRecipeQuickStartLaunchCustomizationsEqual(
          latestCustomizationRef.current,
          customization,
        )
      ) {
        return;
      }

      latestCustomizationRef.current = customization;
      if (isSelectedRef.current) {
        onSelectRef.current(recipe, customization);
      }
    },
    [recipe],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as Element).closest(INTERACTIVE_SELECTOR)) return;
      onSelectRef.current(recipe, latestCustomizationRef.current);
    },
    [recipe],
  );

  return (
    <div
      className={cn(
        "w-full cursor-pointer rounded-md border px-3 py-2.5 text-left transition-colors",
        isSelected
          ? "border-primary/35 bg-accent/30"
          : "border-border/70 bg-transparent hover:border-border hover:bg-accent/20",
      )}
      onClick={handleClick}
    >
      <T3workRecipeQuickStartBody
        recipe={recipe}
        onCustomizationChange={handleCustomizationChange}
      />
    </div>
  );
}

export function T3workKickoffRecipeList({
  recipes,
  onSelectRecipe,
  selectedRecipeId,
}: {
  recipes: ReadonlyArray<T3workSidecarRecipeQuickStart>;
  onSelectRecipe: (
    recipe: T3workSidecarRecipeQuickStart,
    customization?: T3workRecipeQuickStartLaunchCustomization,
  ) => void;
  selectedRecipeId?: string;
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
        return recipe.actionView ? (
          <RichRecipeCard
            key={recipe.id}
            recipe={recipe}
            isSelected={isSelected}
            onSelectRecipe={onSelectRecipe}
          />
        ) : (
          <button
            key={recipe.id}
            type="button"
            className={cn(
              "w-full rounded-md border px-3 py-2.5 text-left transition-colors",
              isSelected
                ? "border-primary/35 bg-accent/30"
                : "border-border/70 bg-transparent hover:border-border hover:bg-accent/30",
            )}
            aria-pressed={isSelected}
            onClick={() => onSelectRecipe(recipe)}
          >
            <T3workRecipeQuickStartBody recipe={recipe} />
          </button>
        );
      })}
    </div>
  );
}
