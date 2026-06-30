import type { Meta, StoryObj } from "@storybook/react";

import {
  LaunchOptionGroup,
  RecipeLaunchControlsProvider,
} from "~/t3work/t3work-recipeActionLaunchControls";
import { T3workRecipeListCard } from "~/t3work/t3work-RecipeListCard";
import { explainSelectedWorkRecipe } from "~/t3work/t3work-sidecarStoryFixtures";

const meta = {
  title: "T3work/Sidecar/RecipeListCard",
  component: T3workRecipeListCard,
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
} satisfies Meta<typeof T3workRecipeListCard>;

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
      <T3workRecipeListCard recipe={explainSelectedWorkRecipe} onClick={() => {}}>
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
      </T3workRecipeListCard>
    </RecipeLaunchControlsProvider>
  ),
};

export const StaticPresentation: Story = {
  args: {
    recipe: explainSelectedWorkRecipe,
  },
};
