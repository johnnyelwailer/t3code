import { autoAnimate } from "@formkit/auto-animate";
import { Fragment, useCallback, useRef, type ReactNode } from "react";

import {
  areT3TeamRecipeQuickStartLaunchCustomizationsEqual,
  type T3TeamRecipeQuickStartLaunchCustomization,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import { cn } from "~/lib/utils";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipes";

import { T3TeamRecipeQuickStartBody } from "~/t3team/t3team-recipeActionView";

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
  recipe: T3TeamSidecarRecipeQuickStart;
  isSelected: boolean;
  onSelectRecipe: (
    recipe: T3TeamSidecarRecipeQuickStart,
    customization?: T3TeamRecipeQuickStartLaunchCustomization,
  ) => void;
}) {
  // Keep stable refs so callbacks never go stale without re-mounting.
  const isSelectedRef = useRef(isSelected);
  isSelectedRef.current = isSelected;
  const onSelectRef = useRef(onSelectRecipe);
  onSelectRef.current = onSelectRecipe;
  const latestCustomizationRef = useRef<T3TeamRecipeQuickStartLaunchCustomization | undefined>(
    undefined,
  );

  const handleCustomizationChange = useCallback(
    (customization: T3TeamRecipeQuickStartLaunchCustomization | undefined) => {
      if (
        areT3TeamRecipeQuickStartLaunchCustomizationsEqual(
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
      <T3TeamRecipeQuickStartBody
        recipe={recipe}
        onCustomizationChange={handleCustomizationChange}
      />
    </div>
  );
}

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
        const content = recipe.actionView ? (
          <RichRecipeCard recipe={recipe} isSelected={isSelected} onSelectRecipe={onSelectRecipe} />
        ) : (
          <button
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
            <T3TeamRecipeQuickStartBody recipe={recipe} />
          </button>
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
