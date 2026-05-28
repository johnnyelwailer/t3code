import { Button } from "~/t3work/components/ui/t3work-button";

import {
  describeT3workSelectedRecipeQuickStart,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";

type TicketKickoffComposerSelectedRecipeProps = {
  selectedRecipe: T3workSelectedRecipeQuickStart;
  onClearSelectedRecipe?: () => void;
};

export function TicketKickoffComposerSelectedRecipe({
  selectedRecipe,
  onClearSelectedRecipe,
}: TicketKickoffComposerSelectedRecipeProps) {
  const selectedRecipeSummary = describeT3workSelectedRecipeQuickStart(selectedRecipe);

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
          {selectedRecipeSummary ? (
            <div className="text-xs leading-5 text-muted-foreground">{selectedRecipeSummary}</div>
          ) : null}
          <div className="text-xs leading-5 text-muted-foreground">
            Add an optional note below, or send now.
          </div>
        </div>
        {onClearSelectedRecipe ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="shrink-0"
            onClick={onClearSelectedRecipe}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
