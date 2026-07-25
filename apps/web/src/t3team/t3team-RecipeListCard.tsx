import { useCallback, useRef, type MouseEvent, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import {
  areT3TeamRecipeQuickStartLaunchCustomizationsEqual,
  type T3TeamRecipeQuickStartLaunchCustomization,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import { T3TeamRecipeQuickStartBody } from "~/t3team/t3team-recipeActionView";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

const INTERACTIVE_SELECTOR = "button, input, select, textarea, a, [role='button'], label";

export function T3TeamRecipeListCard({
  recipe,
  isSelected = false,
  onClick,
  onSelectRecipe,
  children,
}: {
  readonly recipe: T3TeamSidecarRecipeQuickStart;
  readonly isSelected?: boolean;
  readonly onClick?: () => void;
  readonly onSelectRecipe?: (
    customization?: T3TeamRecipeQuickStartLaunchCustomization,
  ) => void;
  readonly children?: ReactNode;
}) {
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
        onSelectRef.current?.(customization);
      }
    },
    [],
  );

  const handleInteractiveClick = useCallback((event: MouseEvent) => {
    if ((event.target as Element).closest(INTERACTIVE_SELECTOR)) {
      return;
    }

    onSelectRef.current?.(latestCustomizationRef.current);
  }, []);

  const className = cn(
    "w-full rounded-md border px-3 py-2.5 text-left transition-colors",
    onClick || onSelectRecipe ? "cursor-pointer" : undefined,
    isSelected
      ? "border-primary/35 bg-accent/30"
      : "border-border/70 bg-transparent hover:border-border hover:bg-accent/20",
  );

  const body = (
    <div className="space-y-2">
      <T3TeamRecipeQuickStartBody
        recipe={recipe}
        {...(onSelectRecipe ? { onCustomizationChange: handleCustomizationChange } : {})}
      />
      {children}
    </div>
  );

  if (onSelectRecipe) {
    return (
      <div className={className} onClick={handleInteractiveClick}>
        {body}
      </div>
    );
  }

  if (!onClick) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" className={className} aria-pressed={isSelected} onClick={onClick}>
      {body}
    </button>
  );
}
