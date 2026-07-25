import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamSidecarCompositionPreview } from "~/t3team/t3team-SidecarCompositionPreview";

const meta = {
  title: "T3Team/Sidecar/SidecarComposition",
  component: T3TeamSidecarCompositionPreview,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof T3TeamSidecarCompositionPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: "default",
  },
};

export const Engineering: Story = {
  name: "SidecarCompositionEngineering",
  args: {
    variant: "engineering",
  },
};

export const QA: Story = {
  name: "SidecarCompositionQA",
  args: {
    variant: "qa",
  },
};
