import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamSelectedRecipeChip } from "~/t3team/t3team-SelectedRecipeChip";

const meta: Meta<typeof T3TeamSelectedRecipeChip> = {
  title: "T3Team/Sidecar/SelectedRecipeChip",
  component: T3TeamSelectedRecipeChip,
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
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Explain this simply",
    description: "Summarize the selected work with user impact, checks, and open questions.",
    onClear: () => {},
  },
};

export const WithSummary: Story = {
  args: {
    title: "Review acceptance criteria",
    description: "Call out ambiguity, missing testability notes, and follow-up questions.",
    summary: "Review for ambiguity",
    onClear: () => {},
  },
};
