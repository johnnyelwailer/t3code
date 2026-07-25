import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamFilterActionCard } from "~/t3team/t3team-FilterActionCard";
import { T3TeamRecipeListCard } from "~/t3team/t3team-RecipeListCard";
import {
  assignedToMeFilterRecipe,
  explainSelectedWorkRecipe,
  reviewAcceptanceCriteriaRecipe,
  shapeBacklogSliceRecipe,
  tshirtSizeEpicRecipe,
} from "~/t3team/t3team-sidecarStoryFixtures";
import { T3TeamTopicSection } from "~/t3team/t3team-TopicSection";

const meta = {
  title: "T3Team/Sidecar/TopicSection",
  component: T3TeamTopicSection,
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
} satisfies Meta<typeof T3TeamTopicSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    sectionId: "refinement",
    title: "Refinement",
    children: [],
  },
  render: () => (
    <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground/70">
      Empty topic sections render nothing — the frame below should not appear.
      <T3TeamTopicSection sectionId="refinement" title="Refinement">
        {[]}
      </T3TeamTopicSection>
    </div>
  ),
};

export const OneCard: Story = {
  args: {
    sectionId: "quick-actions",
    title: "Quick actions",
    children: null,
  },
  render: () => (
    <T3TeamTopicSection sectionId="quick-actions" title="Quick actions">
      <T3TeamRecipeListCard recipe={explainSelectedWorkRecipe} onClick={() => {}} />
    </T3TeamTopicSection>
  ),
};

export const ThreeCards: Story = {
  args: {
    sectionId: "refinement",
    title: "Refinement",
    children: null,
  },
  render: () => (
    <T3TeamTopicSection sectionId="refinement" title="Refinement">
      <T3TeamRecipeListCard recipe={tshirtSizeEpicRecipe} onClick={() => {}} />
      <T3TeamRecipeListCard recipe={shapeBacklogSliceRecipe} onClick={() => {}} />
      <T3TeamRecipeListCard recipe={reviewAcceptanceCriteriaRecipe} onClick={() => {}} />
    </T3TeamTopicSection>
  ),
};

export const FiltersSection: Story = {
  args: {
    sectionId: "filters",
    title: "Filters",
    children: null,
  },
  render: () => (
    <T3TeamTopicSection sectionId="filters" title="Filters">
      <T3TeamFilterActionCard recipe={assignedToMeFilterRecipe} onApply={() => {}} />
    </T3TeamTopicSection>
  ),
};
