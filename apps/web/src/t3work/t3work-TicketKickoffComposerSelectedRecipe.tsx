import {
  describeT3workSelectedRecipeQuickStart,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import { T3workSelectedRecipeChip } from "~/t3work/t3work-SelectedRecipeChip";

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
      <T3workSelectedRecipeChip
        title={selectedRecipe.recipe.title}
        description={selectedRecipe.recipe.description}
        {...(selectedRecipeSummary ? { summary: selectedRecipeSummary } : {})}
        {...(onClearSelectedRecipe ? { onClear: onClearSelectedRecipe } : {})}
      />
    </div>
  );
}
