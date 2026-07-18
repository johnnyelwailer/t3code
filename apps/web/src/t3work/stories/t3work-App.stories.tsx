import type { Meta, StoryObj } from "@storybook/react";
import { App } from "~/t3work/t3work-App";
import { withT3workRouter } from "~/t3work/storybook/t3work-storybook-router-decorator";

const meta = {
  title: "Archived/App",
  component: App,
  decorators: [withT3workRouter],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
