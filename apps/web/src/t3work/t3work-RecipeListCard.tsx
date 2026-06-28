import { useCallback, useRef, type MouseEvent, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import {
  areT3workRecipeQuickStartLaunchCustomizationsEqual,
  type T3workRecipeQuickStartLaunchCustomization,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import { T3workRecipeQuickStartBody } from "~/t3work/t3work-recipeActionView";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

const INTERACTIVE_SELECTOR = "button, input, select, textarea, a, [role='button'], label";

export function T3workRecipeListCard({
  recipe,
  isSelected = false,
  onClick,
  onSelectRecipe,
  children,
}: {
  readonly recipe: T3workSidecarRecipeQuickStart;
  readonly isSelected?: boolean;
  readonly onClick?: () => void;
  readonly onSelectRecipe?: (
    customization?: T3workRecipeQuickStartLaunchCustomization,
  ) => void;
  readonly children?: ReactNode;
}) {
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
      <T3workRecipeQuickStartBody
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
