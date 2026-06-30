import type { Meta, StoryObj } from "@storybook/react";

import { T3workFilterActionCard } from "~/t3work/t3work-FilterActionCard";
import { T3workRecipeListCard } from "~/t3work/t3work-RecipeListCard";
import {
  assignedToMeFilterRecipe,
  explainSelectedWorkRecipe,
  reviewAcceptanceCriteriaRecipe,
  shapeBacklogSliceRecipe,
  tshirtSizeEpicRecipe,
} from "~/t3work/t3work-sidecarStoryFixtures";
import { T3workTopicSection } from "~/t3work/t3work-TopicSection";

const meta = {
  title: "T3work/Sidecar/TopicSection",
  component: T3workTopicSection,
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
} satisfies Meta<typeof T3workTopicSection>;

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
      <T3workTopicSection sectionId="refinement" title="Refinement">
        {[]}
      </T3workTopicSection>
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
    <T3workTopicSection sectionId="quick-actions" title="Quick actions">
      <T3workRecipeListCard recipe={explainSelectedWorkRecipe} onClick={() => {}} />
    </T3workTopicSection>
  ),
};

export const ThreeCards: Story = {
  args: {
    sectionId: "refinement",
    title: "Refinement",
    children: null,
  },
  render: () => (
    <T3workTopicSection sectionId="refinement" title="Refinement">
      <T3workRecipeListCard recipe={tshirtSizeEpicRecipe} onClick={() => {}} />
      <T3workRecipeListCard recipe={shapeBacklogSliceRecipe} onClick={() => {}} />
      <T3workRecipeListCard recipe={reviewAcceptanceCriteriaRecipe} onClick={() => {}} />
    </T3workTopicSection>
  ),
};

export const FiltersSection: Story = {
  args: {
    sectionId: "filters",
    title: "Filters",
    children: null,
  },
  render: () => (
    <T3workTopicSection sectionId="filters" title="Filters">
      <T3workFilterActionCard recipe={assignedToMeFilterRecipe} onApply={() => {}} />
    </T3workTopicSection>
  ),
};
