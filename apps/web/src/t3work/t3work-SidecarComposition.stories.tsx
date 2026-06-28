import type { Meta, StoryObj } from "@storybook/react";

import { T3workSidecarCompositionPreview } from "~/t3work/t3work-SidecarCompositionPreview";

const meta = {
  title: "T3work/Sidecar/SidecarComposition",
  component: T3workSidecarCompositionPreview,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof T3workSidecarCompositionPreview>;

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
