import {
  describeT3TeamSelectedRecipeQuickStart,
  type T3TeamSelectedRecipeQuickStart,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import { T3TeamSelectedRecipeChip } from "~/t3team/t3team-SelectedRecipeChip";

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
      <T3TeamSelectedRecipeChip
        title={selectedRecipe.recipe.title}
        description={selectedRecipe.recipe.description}
        {...(selectedRecipeSummary ? { summary: selectedRecipeSummary } : {})}
        {...(onClearSelectedRecipe ? { onClear: onClearSelectedRecipe } : {})}
      />
    </div>
  );
}
