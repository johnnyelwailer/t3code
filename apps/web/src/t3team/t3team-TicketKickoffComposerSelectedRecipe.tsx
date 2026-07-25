import { X } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";

import {
  describeT3TeamSelectedRecipeQuickStart,
  type T3TeamSelectedRecipeQuickStart,
} from "~/t3team/t3team-recipeQuickStartLaunch";

type TicketKickoffComposerSelectedRecipeProps = {
  selectedRecipe: T3TeamSelectedRecipeQuickStart;
  onClearSelectedRecipe?: () => void;
};

export function TicketKickoffComposerSelectedRecipe({
  selectedRecipe,
  onClearSelectedRecipe,
}: TicketKickoffComposerSelectedRecipeProps) {
  const selectedRecipeSummary = describeT3TeamSelectedRecipeQuickStart(selectedRecipe);

  return (
    <div className="px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/15 bg-accent/30 px-3 py-2.5">
        <div className="min-w-0 space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
            Selected action
          </div>
          <div className="truncate text-sm font-medium text-foreground">
            {selectedRecipe.recipe.title}
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            {selectedRecipe.recipe.description}
          </div>
          {selectedRecipeSummary ? (
            <div className="text-[11px] leading-5 text-muted-foreground/80">
              {selectedRecipeSummary}
            </div>
          ) : null}
        </div>
        {onClearSelectedRecipe ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="shrink-0"
            aria-label="Clear selected action"
            onClick={onClearSelectedRecipe}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
