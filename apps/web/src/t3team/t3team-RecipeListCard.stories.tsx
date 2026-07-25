import type { Meta, StoryObj } from "@storybook/react";

import {
  LaunchOptionGroup,
  RecipeLaunchControlsProvider,
} from "~/t3team/t3team-recipeActionLaunchControls";
import { T3TeamRecipeListCard } from "~/t3team/t3team-RecipeListCard";
import { explainSelectedWorkRecipe } from "~/t3team/t3team-sidecarStoryFixtures";

const meta = {
  title: "T3Team/Sidecar/RecipeListCard",
  component: T3TeamRecipeListCard,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[min(100vw-2rem,22rem)] bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof T3TeamRecipeListCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    recipe: explainSelectedWorkRecipe,
    onClick: () => {},
  },
};

export const Selected: Story = {
  args: {
    recipe: explainSelectedWorkRecipe,
    isSelected: true,
    onClick: () => {},
  },
};

export const WithLaunchOptionGroup: Story = {
  args: {
    recipe: explainSelectedWorkRecipe,
    onClick: () => {},
  },
  render: () => (
    <RecipeLaunchControlsProvider>
      <T3TeamRecipeListCard recipe={explainSelectedWorkRecipe} onClick={() => {}}>
        <LaunchOptionGroup
          name="explanationAudience"
          label="Explain for"
          defaultValue="teammate"
          options={[
            {
              value: "teammate",
              label: "Teammate",
              promptText: "Keep the explanation concise and teammate-facing.",
            },
            {
              value: "stakeholder",
              label: "Stakeholder",
              promptText: "Keep jargon low and lead with user impact and outcome.",
            },
            {
              value: "qa",
              label: "QA",
              promptText: "Bias toward behavior changes, checks, and open verification questions.",
            },
          ]}
        />
      </T3TeamRecipeListCard>
    </RecipeLaunchControlsProvider>
  ),
};

export const StaticPresentation: Story = {
  args: {
    recipe: explainSelectedWorkRecipe,
  },
};
