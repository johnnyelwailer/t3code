import type { Meta, StoryObj } from "@storybook/react";

import { T3workSelectedRecipeChip } from "~/t3work/t3work-SelectedRecipeChip";

const meta = {
  title: "T3work/Sidecar/SelectedRecipeChip",
  component: T3workSelectedRecipeChip,
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
} satisfies Meta<typeof T3workSelectedRecipeChip>;

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
