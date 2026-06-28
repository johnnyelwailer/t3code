import type { Meta, StoryObj } from "@storybook/react";

import { RecipeManagerRecipeList } from "~/t3work/t3work-RecipeManagerRecipeList";
import { groupManagedProjectRecipesByTopic } from "~/t3work/t3work-recipeManagerModel";
import {
  bugTriageRecipe,
  onboardingRecipe,
  releaseChecklistRecipe,
  sprintRetroRecipe,
} from "~/t3work/stories/t3work-recipeManagerFixtures";

function RecipeManagerListStory({
  selectedId = releaseChecklistRecipe.id,
}: {
  readonly selectedId?: string;
}) {
  const groups = groupManagedProjectRecipesByTopic([
    releaseChecklistRecipe,
    sprintRetroRecipe,
    bugTriageRecipe,
    onboardingRecipe,
  ]);
  const selectedRecipePath =
    [releaseChecklistRecipe, sprintRetroRecipe, bugTriageRecipe, onboardingRecipe].find(
      (recipe) => recipe.id === selectedId,
    )?.recipePath ?? null;

  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <div className="w-72 rounded-lg border border-border bg-card">
        <RecipeManagerRecipeList
          groups={groups}
          selectedRecipePath={selectedRecipePath}
          onSelectRecipe={() => {}}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "T3work/Recipes/Manager List",
  component: RecipeManagerListStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RecipeManagerListStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grouped: Story = { args: { selectedId: releaseChecklistRecipe.id } };
export const DeactivatedInGroup: Story = { args: { selectedId: bugTriageRecipe.id } };
