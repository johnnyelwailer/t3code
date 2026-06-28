import { ListFilter } from "lucide-react";

import { cn } from "~/lib/utils";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

function FilterActionCardBody({
  recipe,
}: {
  readonly recipe: T3workSidecarRecipeQuickStart;
}) {
  return (
    <div className="relative min-w-0 pr-7">
      <div className="absolute top-0.5 right-0 flex size-5 items-center justify-center text-muted-foreground/45">
        <ListFilter className="size-3.5" />
      </div>
      <div className="text-sm font-medium text-foreground/90">{recipe.title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground/80">{recipe.description}</p>
    </div>
  );
}

function filterCardSurfaceClassName({
  isSelected,
  disabled,
  interactive,
}: {
  readonly isSelected: boolean;
  readonly disabled: boolean;
  readonly interactive: boolean;
}) {
  return cn(
    "w-full rounded-md border text-left transition-colors",
    interactive ? "cursor-pointer" : undefined,
    isSelected
      ? "border-primary/35 bg-accent/30"
      : "border-border/70 bg-transparent hover:border-border hover:bg-accent/20",
    disabled ? "pointer-events-none opacity-60" : undefined,
  );
}

export function T3workFilterActionCard({
  recipe,
  onApply,
  onRankNext,
  disabled = false,
  isSelected = false,
}: {
  readonly recipe: T3workSidecarRecipeQuickStart;
  readonly onApply?: () => void;
  readonly onRankNext?: () => void;
  readonly disabled?: boolean;
  readonly isSelected?: boolean;
}) {
  const showRankNext = onRankNext !== undefined;
  const isDirectAction = onApply !== undefined && !showRankNext;

  if (isDirectAction) {
    return (
      <button
        type="button"
        className={cn(filterCardSurfaceClassName({ isSelected, disabled, interactive: true }), "px-3 py-2.5")}
        disabled={disabled}
        aria-pressed={isSelected}
        onClick={onApply}
      >
        <FilterActionCardBody recipe={recipe} />
      </button>
    );
  }

  if (showRankNext && onApply) {
    return (
      <div
        className={cn(
          filterCardSurfaceClassName({ isSelected, disabled, interactive: false }),
          "overflow-hidden",
        )}
      >
        <button
          type="button"
          className={cn(
            "w-full px-3 py-2.5 text-left transition-colors",
            disabled ? undefined : "hover:bg-accent/15",
          )}
          disabled={disabled}
          aria-pressed={isSelected}
          onClick={onApply}
        >
          <FilterActionCardBody recipe={recipe} />
        </button>
        <div className="border-t border-border/50 px-3 py-2">
          <button
            type="button"
            className={cn(
              "inline-flex h-7 items-center rounded-md border border-border/60 bg-transparent px-2.5 text-[11px] font-medium text-muted-foreground transition-colors",
              "hover:border-border hover:bg-accent/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
            )}
            disabled={disabled}
            onClick={onRankNext}
          >
            Rank next
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        filterCardSurfaceClassName({ isSelected, disabled, interactive: false }),
        "px-3 py-2.5",
      )}
    >
      <FilterActionCardBody recipe={recipe} />
      {showRankNext ? (
        <div className="pt-2">
          <button
            type="button"
            className={cn(
              "inline-flex h-7 items-center rounded-md border border-border/60 bg-transparent px-2.5 text-[11px] font-medium text-muted-foreground transition-colors",
              "hover:border-border hover:bg-accent/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
            )}
            disabled={disabled}
            onClick={onRankNext}
          >
            Rank next
          </button>
        </div>
      ) : null}
    </div>
  );
}
