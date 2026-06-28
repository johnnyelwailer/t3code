import type { Meta, StoryObj } from "@storybook/react";

import { T3workFilterActionCard } from "~/t3work/t3work-FilterActionCard";
import {
  assignedToMeFilterRecipe,
  clearFiltersRecipe,
  needsMyActionFilterRecipe,
} from "~/t3work/t3work-sidecarStoryFixtures";

const meta = {
  title: "T3work/Sidecar/FilterActionCard",
  component: T3workFilterActionCard,
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
} satisfies Meta<typeof T3workFilterActionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ApplyOnly: Story = {
  name: "Direct action (no params)",
  args: {
    recipe: assignedToMeFilterRecipe,
    onApply: () => {},
  },
};

export const ApplyAndRankNext: Story = {
  name: "Apply + Rank next",
  args: {
    recipe: needsMyActionFilterRecipe,
    onApply: () => {},
    onRankNext: () => {},
  },
};

export const Selected: Story = {
  args: {
    recipe: needsMyActionFilterRecipe,
    isSelected: true,
    onApply: () => {},
    onRankNext: () => {},
  },
};

export const Disabled: Story = {
  args: {
    recipe: assignedToMeFilterRecipe,
    disabled: true,
    onApply: () => {},
  },
};

export const ClearFilters: Story = {
  name: "Clear filters (direct action)",
  args: {
    recipe: clearFiltersRecipe,
    onApply: () => {},
  },
};
